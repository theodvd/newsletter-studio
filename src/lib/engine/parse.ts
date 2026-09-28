/**
 * Parsing des flux, filtre de fraîcheur et déduplication.
 *
 * Porté depuis le nœud n8n « Parser et filtrer ». La logique est reprise
 * FIDÈLEMENT, y compris `normalizeUrl` écrite en expressions régulières alors
 * que `URL` est disponible ici : les `url_norm` déjà stockés en base ont été
 * calculés par cette fonction exacte. En changer le comportement ferait repartir
 * la déduplication de zéro et enverrait des doublons à tous les lecteurs.
 */

import type { Article, DeliveredItemRow, SourceFetchTarget } from "./types";

/**
 * Fenêtre de fraîcheur, déduite de la fréquence d'envoi.
 * On raisonne en envois par semaine, en développant les plages (1-5 = 5 jours) :
 * un test naïf sur le jour de semaine classait « 0 8 * * 1-5 » (quotidien en
 * semaine) comme hebdomadaire, d'où une fenêtre de 8 jours et des articles
 * périmés dans les digests quotidiens.
 */
export function lookbackHours(cron: string, now: Date = new Date()): number {
  const parts = String(cron || "").trim().split(/\s+/);
  const hours = parts[1] || "7";
  const dow = parts[4] || "*";

  const runsPerDay = hours.split(",").length;
  let daysPerWeek = 7;
  if (dow !== "*") {
    daysPerWeek = dow.split(",").reduce((acc, p) => {
      const m = p.match(/^(\d+)-(\d+)$/);
      return acc + (m ? parseInt(m[2]) - parseInt(m[1]) + 1 : 1);
    }, 0);
  }
  const runsPerWeek = runsPerDay * daysPerWeek;

  if (runsPerWeek >= 10) return 14; // deux fois par jour
  if (runsPerWeek >= 5) {
    // Quotidien : 30h, sauf le lundi d'une veille lun-ven où l'on couvre le
    // week-end écoulé (sinon les news de samedi et dimanche sont perdues).
    const isMondayWeekdaysOnly = now.getDay() === 1 && !/[06]/.test(dow);
    return isMondayWeekdaysOnly ? 78 : 30;
  }
  if (runsPerWeek >= 2) return 4 * 24; // bi-hebdomadaire
  return 8 * 24; // hebdomadaire
}

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "utm_id", "utm_source_platform", "utm_creative_format", "utm_marketing_tactic",
  "fbclid", "gclid", "msclkid", "twclid", "li_fat_id",
  "mc_cid", "mc_eid", "ref", "source", "campaign", "cid",
  "_ga", "_gl", "igshid", "yclid", "zanpid", "dclid",
  "srsltid", "epik", "pk_source", "pk_medium", "pk_campaign",
]);

/**
 * Normalisation canonique d'une URL : force https, retire www./amp., supprime
 * les paramètres de tracking, trie ceux qui restent, coupe fragment et slash
 * final. Renvoie null si l'URL est malformée.
 */
export function normalizeUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const s = String(rawUrl).trim();
  const m = s.match(/^https?:\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i);
  if (!m) return null;

  let host = m[1].toLowerCase();
  if (host.indexOf("@") !== -1) host = host.slice(host.indexOf("@") + 1);
  if (host.startsWith("www.")) host = host.slice(4);
  if (host.startsWith("amp.")) host = host.slice(4);

  let path = m[2] || "";
  path = path.replace(/\/amp\/?$/, "").replace(/\/amp\//, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  let query = "";
  if (m[3]) {
    const kept: Record<string, string> = {};
    for (const pair of m[3].split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const k = eq === -1 ? pair : pair.slice(0, eq);
      const kLow = k.toLowerCase();
      if (TRACKING_PARAMS.has(kLow) || kLow.indexOf("utm_") === 0) continue;
      kept[k] = eq === -1 ? "" : pair.slice(eq + 1);
    }
    const keys = Object.keys(kept).sort();
    if (keys.length) {
      query = "?" + keys.map((k) => (kept[k] === "" ? k : k + "=" + kept[k])).join("&");
    }
  }
  return "https://" + host + path + query;
}

/** Ancienne normalisation, conservée pour reconnaître l'historique d'avant migration. */
export function normalizeUrlLegacy(rawUrl: string | null | undefined): string {
  return String(rawUrl || "").replace(/[?#].*$/, "").replace(/\/$/, "");
}

const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "en", "et", "au", "aux", "a",
  "the", "an", "of", "in", "for", "on", "with", "by", "is", "are", "was",
  "que", "qui", "dans", "sur", "par", "pour", "ou", "si", "car", "mais", "donc",
]);

/**
 * Empreinte de titre : 5 premiers mots significatifs, déaccentués et triés,
 * pour repérer un même sujet reformulé d'une source à l'autre.
 */
export function titleKey(title: string | null | undefined): string | null {
  if (!title) return null;
  const words = String(title)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (words.length === 0) return null;
  return words.slice(0, 5).sort().join(" ");
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr || String(dateStr).trim() === "") return null;
  const d = new Date(String(dateStr).trim());
  return isNaN(d.getTime()) ? null : d;
}

/** Retire balises et CDATA, décode les entités HTML courantes. */
export function stripTags(s: string | null | undefined): string {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    // Les flux encodent les URLs (&amp; dans les query strings) : sans décodage,
    // les paramètres de tracking ne sont pas reconnus et la dédup se dérègle.
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeFeed(body: string): boolean {
  return /<(rss|feed|rdf)[\s>]/i.test(body.substring(0, 2000));
}

/** Formats d'image mal pris en charge par les clients mail (Gmail, Outlook). */
export const UNSUPPORTED_EMAIL_IMAGE = /\.avif(?:[?#]|$)/i;

function normalizeImageUrl(raw: string): string | null {
  const decoded = raw.replace(/&amp;/g, "&").trim();
  if (UNSUPPORTED_EMAIL_IMAGE.test(decoded)) return null;
  return /^https:\/\//i.test(decoded) ? decoded : null;
}

/**
 * Image d'un item RSS/Atom : `media:content`, `media:thumbnail`, une
 * `enclosure` de type image, sinon la première `<img>` du contenu
 * (`content:encoded` ou `description`). HTTPS uniquement : une image en http
 * casserait le rendu dans les clients mail qui bloquent le contenu mixte.
 * Porté depuis `extractImage` du workflow n8n Growfin (`workflow-v2.js`).
 */
function extractImage(itemXml: string): string | null {
  const mediaContent = itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (mediaContent) return normalizeImageUrl(mediaContent[1]);

  const mediaThumbnail = itemXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  if (mediaThumbnail) return normalizeImageUrl(mediaThumbnail[1]);

  const enclosure =
    itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image[^"']*["']/i) ||
    itemXml.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i);
  if (enclosure) return normalizeImageUrl(enclosure[1]);

  const imgTag = itemXml.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgTag) return normalizeImageUrl(imgTag[1]);

  return null;
}

export type FetchedSource = {
  target: SourceFetchTarget;
  body: string;
};

/**
 * Transforme les corps récupérés en articles candidats : fraîcheur, dédup
 * inter-run (historique) et intra-run (URL et titre).
 */
export function parseAndFilter(
  fetched: FetchedSource[],
  deliveredItems: DeliveredItemRow[],
  cron: string,
  now: Date = new Date()
): { articles: Article[]; lookback: number; cutoff: Date } {
  const lbHours = lookbackHours(cron, now);
  const cutoff = new Date(now.getTime() - lbHours * 3600 * 1000);

  // Historique : on compare sur trois formes pour ne rater ni l'ancien ni le
  // nouveau format de normalisation.
  const alreadySent = new Set<string>();
  const sentTitleKeys = new Set<string>();
  for (const d of deliveredItems || []) {
    if (d.url_hash) alreadySent.add(d.url_hash);
    if (d.url) alreadySent.add(normalizeUrlLegacy(d.url));
    const norm3 = normalizeUrl(d.url);
    if (norm3) alreadySent.add(norm3);
    if (d.title_key) sentTitleKeys.add(d.title_key);
  }

  const articles: Article[] = [];
  const seenNormInRun = new Set<string>();
  const seenTitleInRun = new Set<string>();

  for (const { target: meta, body } of fetched) {
    if (typeof body !== "string" || !body) continue;

    if (looksLikeFeed(body)) {
      const xmlItems =
        body.match(/<item[\s\S]*?<\/item>/g) ||
        body.match(/<entry[\s\S]*?<\/entry>/g) ||
        [];
      let kept = 0;

      for (const itemXml of xmlItems) {
        const get = (tag: string): string => {
          const m = itemXml.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">"));
          return m ? stripTags(m[1]) : "";
        };

        const title = get("title");
        if (!title) continue;

        const pubDateStr = get("pubDate") || get("published") || get("updated") || get("dc:date");
        const pubDate = parseDate(pubDateStr);

        // Fenêtre courte (quotidien ou plus) : on rejette les items sans date
        // parseable, sinon les articles épinglés tournent en boucle. Au-delà
        // de 48h (hebdo), on accepte en marquant « undated ».
        if (!pubDate) {
          if (lbHours <= 48) continue;
        } else if (pubDate < cutoff) {
          continue;
        }

        let urlRaw = get("link") || get("guid");
        if (!urlRaw) {
          const m = itemXml.match(/<link[^>]+href=["']([^"']+)["']/);
          if (m) urlRaw = m[1];
        }
        if (!urlRaw) continue;

        const urlNorm = normalizeUrl(urlRaw);
        if (!urlNorm) continue;

        if (alreadySent.has(urlNorm) || alreadySent.has(normalizeUrlLegacy(urlRaw))) continue;
        if (seenNormInRun.has(urlNorm)) continue;

        const tKey = titleKey(title);
        if (tKey && sentTitleKeys.has(tKey)) continue;
        if (tKey && seenTitleInRun.has(tKey)) continue;

        seenNormInRun.add(urlNorm);
        if (tKey) seenTitleInRun.add(tKey);

        articles.push({
          title,
          url: urlRaw,
          url_norm: urlNorm,
          title_key: tKey,
          summary: (get("description") || get("summary") || get("content")).substring(0, 400),
          source: meta.sourceTitle,
          pubDate: pubDateStr,
          dateConfidence: pubDate ? "confirmed" : "undated",
          image_url: extractImage(itemXml),
        });
        if (++kept >= 5) break;
      }
    } else {
      // Source HTML : uniquement si elle est DÉCLARÉE « scrape ». Si un flux
      // RSS renvoie du non-XML, c'est un échec de récupération (page 502), pas
      // un contenu : en faire un article produirait un faux positif.
      if (meta.sourceType !== "scrape") continue;

      const urlRaw = meta.sourceUrl;
      const urlNorm = normalizeUrl(urlRaw);
      if (!urlNorm) continue;
      if (alreadySent.has(urlNorm) || alreadySent.has(normalizeUrlLegacy(urlRaw))) continue;
      if (seenNormInRun.has(urlNorm)) continue;

      const titleRaw = stripTags(
        (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || meta.sourceTitle
      );
      const tKey = titleKey(titleRaw);
      if (tKey && (sentTitleKeys.has(tKey) || seenTitleInRun.has(tKey))) continue;

      seenNormInRun.add(urlNorm);
      if (tKey) seenTitleInRun.add(tKey);

      const desc =
        (body.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || [])[1] || "";
      const text = stripTags(
        body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
      ).substring(0, 1500);

      articles.push({
        title: titleRaw,
        url: urlRaw,
        url_norm: urlNorm,
        title_key: tKey,
        summary: (desc + " " + text).substring(0, 800),
        source: meta.sourceTitle,
        pubDate: "",
        dateConfidence: "undated",
      });
    }
  }

  return { articles, lookback: lbHours, cutoff };
}
