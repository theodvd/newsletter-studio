/**
 * Validation d'une source donnée par l'utilisateur :
 * 1. Si l'URL est déjà un flux RSS/Atom → ok
 * 2. Sinon autodiscovery : <link rel="alternate"> puis chemins classiques (/feed, /rss…)
 * 3. Sinon → source de type "scrape" (la page sera lue telle quelle par le moteur)
 */

const FEED_PATHS = ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/index.xml"];

type SourceValidation = {
  url: string;
  type: "rss" | "scrape" | "error";
  feed_url: string | null;
  title: string | null;
  fresh_items: number;
  sample_titles: string[];
  note: string;
};

async function fetchText(url: string): Promise<{ ok: boolean; text: string; contentType: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LiaVeille/1.0)" },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });
    return {
      ok: res.ok,
      text: await res.text(),
      contentType: res.headers.get("content-type") || "",
    };
  } catch {
    return { ok: false, text: "", contentType: "" };
  }
}

function looksLikeFeed(text: string): boolean {
  return /<(rss|feed|rdf)[\s>]/i.test(text.slice(0, 2000));
}

function feedInfo(xml: string): { title: string | null; freshItems: number; samples: string[] } {
  const items = xml.match(/<item[\s\S]*?<\/item>/g) || xml.match(/<entry[\s\S]*?<\/entry>/g) || [];
  const titleMatch = xml.match(/<title[^>]*>([\s\S]*?)<\/title>/);
  const clean = (s: string) =>
    s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
  const cutoff = Date.now() - 14 * 24 * 3600 * 1000;
  let fresh = 0;
  const samples: string[] = [];
  for (const item of items.slice(0, 10)) {
    const t = item.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    if (t && samples.length < 3) samples.push(clean(t[1]));
    const d = item.match(/<(pubDate|published|updated)[^>]*>([\s\S]*?)<\//);
    if (d) {
      const date = new Date(d[2].trim());
      if (!isNaN(date.getTime()) && date.getTime() > cutoff) fresh++;
    }
  }
  return { title: titleMatch ? clean(titleMatch[1]) : null, freshItems: fresh, samples };
}

export async function validateSource(rawUrl: string): Promise<SourceValidation> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  const page = await fetchText(url);
  if (!page.ok && !page.text) {
    return { url, type: "error", feed_url: null, title: null, fresh_items: 0, sample_titles: [], note: "URL inaccessible (timeout ou erreur réseau). Vérifier l'adresse, ou la source nécessite peut-être une clé API." };
  }

  // Cas 1 : l'URL est déjà un flux
  if (looksLikeFeed(page.text)) {
    const info = feedInfo(page.text);
    return { url, type: "rss", feed_url: url, title: info.title, fresh_items: info.freshItems, sample_titles: info.samples, note: "Flux RSS/Atom valide." };
  }

  // Cas 2 : autodiscovery dans le HTML
  const linkTags = page.text.match(/<link[^>]+rel=["']alternate["'][^>]*>/gi) || [];
  for (const tag of linkTags) {
    if (!/application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const feedUrl = new URL(href, url).toString();
    const feed = await fetchText(feedUrl);
    if (feed.ok && looksLikeFeed(feed.text)) {
      const info = feedInfo(feed.text);
      return { url, type: "rss", feed_url: feedUrl, title: info.title, fresh_items: info.freshItems, sample_titles: info.samples, note: "Flux découvert via la balise <link> de la page." };
    }
  }

  // Cas 3 : chemins classiques
  const base = new URL(url);
  for (const path of FEED_PATHS) {
    const candidate = `${base.origin}${path}`;
    const feed = await fetchText(candidate);
    if (feed.ok && looksLikeFeed(feed.text)) {
      const info = feedInfo(feed.text);
      return { url, type: "rss", feed_url: candidate, title: info.title, fresh_items: info.freshItems, sample_titles: info.samples, note: "Flux trouvé sur un chemin standard." };
    }
  }

  // Cas 4 : pas de flux → scrape
  const title = page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || null;
  return { url, type: "scrape", feed_url: null, title, fresh_items: 0, sample_titles: [], note: "Pas de flux RSS trouvé : la page sera lue directement (qualité moindre). Demander à l'utilisateur si une API existe pour cette source." };
}
