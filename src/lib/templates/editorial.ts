/**
 * Template editorial : la structure et le look de l'ancienne newsletter
 * personnelle de la fondatrice (« Growfin »), rendus génériques (aucune
 * mention de marque, couleurs pilotées par `design.accent`). C'est le
 * template par défaut des nouvelles veilles.
 *
 * Porté depuis `~/PRO/Growfin/v2/` : `prompt-v2.json` pour les sections et le
 * ton, `workflow-v2.js` (fonctions `tag`, `sectionHeader`, `separator`,
 * `radarImage`, assemblage HTML autour de la ligne 900) pour la mise en page.
 */

import { readableOn, tint } from "./color";
import { type Labels, labelsFor, normalizeLanguage } from "./i18n";
import { JSON_ONLY_REMINDER, URLS_ONLY_RULE, languageRule } from "./rules";
import type {
  DeepDive,
  Edition,
  EditionItem,
  NumberHighlight,
  Pick as PickItem,
  RenderContext,
  SectionId,
  SlackPayload,
  SpecContext,
  Template,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Spec (prompt)
// ─────────────────────────────────────────────────────────────────────────

/** Formules bannies, français (adapté de Growfin) et anglais. */
const BANNED_PHRASES = [
  "la vraie question", "le vrai sujet", "le vrai enjeu",
  "pour contextualiser", "pour mettre en perspective",
  "le timing n'est pas anodin", "le timing est stratégique",
  "utile pour", "à surveiller", "on a déjà vu ce film", "c'est exactement",
  "the real question", "the real issue", "it's worth noting",
  "in today's fast-paced", "game-changer", "for context",
  "to put this in perspective", "worth watching", "we've seen this movie before",
];

/** Sections actives : celles du design, moins deep_dive/pick sur Slack (pas de place pour un long format). */
function activeSections(ctx: SpecContext): SectionId[] {
  if (ctx.channel === "slack") {
    return ctx.design.sections.filter((s) => s !== "deep_dive" && s !== "pick");
  }
  return ctx.design.sections;
}

function outputSpec(ctx: SpecContext): string {
  const active = activeSections(ctx);
  const has = (id: SectionId) => active.includes(id);

  let structure =
    "{\n" +
    '  "subject": "Objet de l\'email : 55 caracteres max, pas de date, la tension du meilleur sujet",\n' +
    '  "preheader": "90 caracteres max : annonce 2 AUTRES sujets de l\'edition, ne repete ni l\'objet ni l\'intro",\n' +
    '  "intro": "2 a 4 phrases, personnalisees pour le profil du destinataire, se terminant par l\'annonce des sujets du radar",\n';

  if (has("radar")) {
    structure +=
      '  "radar": [\n' +
      "    {\n" +
      '      "tag": "categorie courte en minuscules",\n' +
      '      "title": "Titre editorialise",\n' +
      '      "summary": "2-3 phrases : le fait et son contexte",\n' +
      '      "takeaway": "1-2 phrases : ce que ca change POUR CE lecteur, vu son profil",\n' +
      '      "url": "URL EXACTE copiee depuis les donnees",\n' +
      '      "source": "Nom de la source"\n' +
      "    }\n" +
      "  ],\n";
  }
  if (has("deep_dive")) {
    structure +=
      '  "deep_dive": {\n' +
      '    "tag": "categorie courte",\n' +
      '    "title": "Titre du sujet approfondi",\n' +
      '    "url": "URL EXACTE de l\'article principal",\n' +
      '    "source": "Nom de la source",\n' +
      '    "parts": [{"heading": "Court intitule", "body": "Paragraphe"}],\n' +
      '    "in_short": "2-3 phrases de synthese finale"\n' +
      "  },\n";
  }
  if (has("signal")) {
    structure +=
      '  "signal": [\n' +
      "    {\n" +
      '      "tag": "categorie courte",\n' +
      '      "title": "Titre court",\n' +
      '      "summary": "1-2 phrases",\n' +
      '      "url": "URL EXACTE",\n' +
      '      "source": "Nom de la source"\n' +
      "    }\n" +
      "  ],\n";
  }
  if (has("number")) {
    structure +=
      '  "number": {\n' +
      '    "value": "Nombre court, ex. 450 ou $53bn",\n' +
      '    "label": "Ce que ce nombre mesure",\n' +
      '    "context": "1-2 phrases",\n' +
      '    "url": "URL EXACTE de l\'article d\'ou vient ce nombre",\n' +
      '    "source": "Nom de la source"\n' +
      "  },\n";
  }
  if (has("pick")) {
    structure +=
      '  "pick": {\n' +
      '    "title": "Titre de la lecture, du rapport ou de l\'outil",\n' +
      '    "kind": "article|rapport|outil|podcast|thread",\n' +
      '    "why": "1-2 phrases : pourquoi ca merite le temps du lecteur",\n' +
      '    "url": "URL EXACTE",\n' +
      '    "source": "Nom de la source"\n' +
      "  },\n";
  }
  structure += '  "outro": "1 phrase de cloture, ou chaine vide"\n}';

  const rules: string[] = [
    `Sections a produire, en plus de subject/preheader/intro/outro : ${active.join(", ")}. N'en ajoute aucune autre.`,
    "Chaque article n'est utilise qu'une seule fois dans toute l'edition, tous champs confondus.",
    "Chaque sujet (le meme evenement, la meme annonce) n'apparait qu'une seule fois dans toute l'edition, meme si plusieurs articles en parlent : garde la meilleure source.",
    "Ecarte les contenus promotionnels (reductions, offres, billets, contenus sponsorises, annonces d'intervenants ou de programme d'un evenement), sauf s'ils sont une vraie information pour ce profil.",
    "Orthographe soignee dans la langue de redaction, accents compris y compris sur les majuscules (en francais : É, À, Ç...), meme si ces instructions sont ecrites sans accents.",
    URLS_ONLY_RULE,
    "source doit etre l'editeur d'origine de l'article quand il est identifiable, jamais un agregateur.",
    "Aucun emoji, nulle part dans le contenu.",
    "N'utilise JAMAIS le tiret cadratin (caractere Unicode U+2014) : remplace-le par des virgules, deux-points ou parentheses.",
    "Formules interdites, zero occurrence, dans les deux langues : " +
      BANNED_PHRASES.map((p) => `« ${p} »`).join(", ") + ".",
    "Au maximum une fois dans toute l'edition une structure du type « ce n'est pas X, c'est Y » / « it's not X, it's Y ».",
    languageRule(ctx.language),
    JSON_ONLY_REMINDER,
  ];
  if (has("radar")) rules.push("radar contient EXACTEMENT 3 items, classes du plus important au moins important.");
  if (has("signal")) rules.push("signal contient 3 a 5 items courts.");
  if (has("deep_dive")) {
    rules.push(
      "deep_dive.parts contient 2 a 4 parties avec un intitule court chacune, pour un total de 300 a 500 mots."
    );
  }
  if (has("number")) {
    rules.push("number DOIT venir d'un des articles fournis ci-dessous : n'invente jamais de chiffre.");
    rules.push(
      "number est un fait qui dit quelque chose du marche, d'une entreprise ou d'une regle (montant leve, croissance, part de marche, emplois, amende...), jamais le prix d'une offre ou une reduction."
    );
  }

  return (
    "## Format de sortie\n" +
    "Tu reponds avec un JSON valide, exactement cette structure :\n" +
    structure +
    "\n\n## Regles strictes\n" +
    rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
  );
}

/**
 * Longueur de sortie ATTENDUE par section, en tokens. Mesurée sur une vraie
 * édition quotidienne (Radar, Signal, Chiffre) : elle a dépassé 2 800 tokens,
 * les URLs et la structure JSON pesant plus lourd qu'on ne l'imagine.
 */
const EXPECTED_BASE = 900; // objet, preheader, intro, enveloppe JSON
const EXPECTED_PER_SECTION: Record<SectionId, number> = {
  radar: 1500,
  deep_dive: 1500,
  signal: 1000,
  number: 250,
  pick: 300,
};

/**
 * Le plafond laisse une large marge au-dessus de l'attendu. Ce n'est pas un
 * coût (seuls les tokens réellement écrits sont facturés), c'est un
 * garde-fou : trop bas, l'édition est tronquée et part en erreur.
 */
const CEILING_MARGIN = 1.8;
const MIN_TOKENS = 4000;
const MAX_TOKENS = 12000;

/**
 * Longueur de sortie attendue pour un jeu de sections, sans dépendre d'un
 * `SpecContext`. Exportée pour que `pricing.ts` estime le coût d'une veille
 * depuis son seul `Design`.
 */
export function expectedOutputTokensForSections(sections: SectionId[]): number {
  return sections.reduce((sum, s) => sum + EXPECTED_PER_SECTION[s], EXPECTED_BASE);
}

function maxOutputTokens(ctx: SpecContext): number {
  const expected = expectedOutputTokensForSections(activeSections(ctx));
  return Math.min(MAX_TOKENS, Math.max(MIN_TOKENS, Math.round(expected * CEILING_MARGIN)));
}

// ─────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────

function isHttpUrl(url: unknown): boolean {
  return /^https?:\/\//i.test(String(url ?? "").trim());
}

// Tiret cadratin (U+2014), construit par code point plutôt qu'écrit en clair
// dans le source : ce fichier doit rester exempt de ce caractère littéral.
const EM_DASH = String.fromCharCode(0x2014);
const EM_DASH_PATTERN = new RegExp("\\s*" + EM_DASH + "\\s*", "g");

/**
 * Le titre d'en-tête vient du nom de la veille ou du design, c'est-à-dire de
 * l'utilisateur, pas du modèle : il échappe donc à `validate`. Même règle ici.
 */
function cleanTitle(value: string): string {
  return value.trim().replace(EM_DASH_PATTERN, ", ");
}

/**
 * Trim + remplace tout tiret cadratin (U+2014, et les espaces autour) par ", ",
 * récursivement. Filet défensif : la spec l'interdit déjà au modèle, mais on
 * ne fait jamais confiance à une sortie de LLM pour une règle de style.
 */
function deepSanitizeStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim().replace(EM_DASH_PATTERN, ", ");
  }
  if (Array.isArray(value)) return value.map(deepSanitizeStrings);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepSanitizeStrings(v);
    return out;
  }
  return value;
}

function str(o: Record<string, unknown>, key: string): string {
  return typeof o[key] === "string" ? (o[key] as string) : "";
}
function strOpt(o: Record<string, unknown>, key: string): string | undefined {
  return typeof o[key] === "string" && (o[key] as string) ? (o[key] as string) : undefined;
}

function sanitizeItem(raw: unknown): EditionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    tag: strOpt(o, "tag"),
    title: str(o, "title"),
    summary: strOpt(o, "summary"),
    takeaway: strOpt(o, "takeaway"),
    url: str(o, "url"),
    source: strOpt(o, "source"),
  };
}

function sanitizeDeepDive(raw: unknown): DeepDive {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawParts = Array.isArray(o.parts) ? o.parts : [];
  const parts = rawParts
    .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
    .map((p) => ({ heading: str(p, "heading"), body: str(p, "body") }))
    .filter((p) => p.body);
  if (parts.length === 0) {
    throw new Error("deep_dive : aucune partie valide (parts).");
  }
  return {
    tag: strOpt(o, "tag"),
    title: str(o, "title"),
    url: str(o, "url"),
    source: strOpt(o, "source"),
    parts,
    in_short: str(o, "in_short"),
  };
}

function sanitizeNumber(raw: unknown): NumberHighlight {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    value: str(o, "value"),
    label: str(o, "label"),
    context: str(o, "context"),
    url: strOpt(o, "url"),
    source: strOpt(o, "source"),
  };
}

function sanitizePick(raw: unknown): PickItem {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    title: str(o, "title"),
    kind: str(o, "kind"),
    why: str(o, "why"),
    url: str(o, "url"),
    source: strOpt(o, "source"),
  };
}

function validate(parsed: unknown, ctx: SpecContext): Edition {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Réponse du modèle invalide : JSON racine attendu.");
  }
  const active = activeSections(ctx);
  const obj = parsed as Record<string, unknown>;

  const requiredKeys: string[] = ["subject", "intro", ...active];
  const missing = requiredKeys.filter((k) => obj[k] === undefined || obj[k] === null || obj[k] === "");
  if (missing.length > 0) {
    throw new Error("Sections manquantes dans le JSON : " + missing.join(", "));
  }

  const clean = deepSanitizeStrings(obj) as Record<string, unknown>;

  const edition: Edition = {
    subject: str(clean, "subject"),
    intro: str(clean, "intro"),
  };
  const preheader = strOpt(clean, "preheader");
  if (preheader) edition.preheader = preheader;

  if (active.includes("radar")) {
    const items = (Array.isArray(clean.radar) ? clean.radar : [])
      .map(sanitizeItem)
      .filter((it): it is EditionItem => it !== null && isHttpUrl(it.url))
      .slice(0, 3);
    if (items.length === 0) throw new Error("radar : aucun item avec une URL http(s) valide.");
    edition.radar = items;
  }

  if (active.includes("signal")) {
    const items = (Array.isArray(clean.signal) ? clean.signal : [])
      .map(sanitizeItem)
      .filter((it): it is EditionItem => it !== null && isHttpUrl(it.url))
      .slice(0, 5);
    if (items.length === 0) throw new Error("signal : aucun item avec une URL http(s) valide.");
    edition.signal = items;
  }

  if (active.includes("deep_dive")) edition.deep_dive = sanitizeDeepDive(clean.deep_dive);
  if (active.includes("number")) edition.number = sanitizeNumber(clean.number);
  if (active.includes("pick")) edition.pick = sanitizePick(clean.pick);

  dropRepeatedSignals(edition);

  const outro = strOpt(clean, "outro");
  if (outro) edition.outro = outro;

  return edition;
}

/** Clé de comparaison d'URL, volontairement simple : schéma, www, paramètres et slash final ignorés. */
function urlKey(url: string | undefined): string {
  return String(url ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

/**
 * Retire du Signal toute brève dont l'article est déjà cité dans une autre
 * section. La spec l'interdit au modèle, mais la première édition réelle
 * (24/09) a quand même repris en Signal l'article du Chiffre : une règle de
 * prompt ne suffit pas, on l'applique ici. Le Signal est la section la moins
 * coûteuse à amputer, c'est donc lui qui cède.
 */
function dropRepeatedSignals(edition: Edition): void {
  if (!edition.signal) return;
  const used = new Set(
    [
      ...(edition.radar ?? []).map((it) => it.url),
      edition.deep_dive?.url,
      edition.number?.url,
      edition.pick?.url,
    ]
      .map(urlKey)
      .filter(Boolean)
  );
  const kept = edition.signal.filter((it) => !used.has(urlKey(it.url)));
  if (kept.length > 0) edition.signal = kept;
  else delete edition.signal;
}

// ─────────────────────────────────────────────────────────────────────────
// Rendu email
// ─────────────────────────────────────────────────────────────────────────

const WIDTH = 600;
const PAD = 24;
const CONTENT_WIDTH = WIDTH - PAD * 2; // 552, la borne demandée pour les images

const STONE_900 = "#1C1917";
const STONE_700 = "#44403C";
const STONE_500 = "#78716C";
const STONE_300 = "#D6D3D1";
const STONE_200 = "#E7E5E3";
const STONE_100 = "#F5F5F4";
const STONE_50 = "#FAFAF9";

const FONT_SANS = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const FONT_SERIF = "Georgia,'Times New Roman',serif";
const FONT_MONO = "'Courier New',monospace";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Les URLs viennent du modèle : on n'accepte que http(s) dans un href. */
function safeHref(url: unknown): string {
  const s = String(url ?? "").trim();
  return /^https?:\/\//i.test(s) ? esc(s) : "#";
}

/** Les images ne sont acceptées qu'en https, jamais en http. */
function safeImageSrc(url: unknown): string | null {
  const s = String(url ?? "").trim();
  return /^https:\/\//i.test(s) ? esc(s) : null;
}

function sectionHeader(accent: string, eyebrow: string, title: string): string {
  return (
    `<tr><td style="padding:32px ${PAD}px 0 ${PAD}px;">` +
    `<table cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td width="4" style="width:4px;background:${esc(accent)};border-radius:2px;">&nbsp;</td>` +
    `<td style="padding-left:12px;">` +
    `<div style="font-family:${FONT_MONO};font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${esc(
      accent
    )};background:${tint(accent, 0.92)};padding:3px 10px;border-radius:3px;display:inline-block;font-weight:600;margin-bottom:6px;">${esc(
      eyebrow
    )}</div>` +
    (title
      ? `<div style="font-family:${FONT_SERIF};font-size:22px;color:${STONE_900};letter-spacing:-0.3px;line-height:1.3;">${esc(
          title
        )}</div>`
      : "") +
    "</td></tr></table></td></tr>"
  );
}

function separator(): string {
  return `<tr><td style="padding:0 ${PAD}px;"><div style="border-bottom:1px solid ${STONE_200};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;
}

function tagPill(accent: string, label?: string): string {
  if (!label) return "";
  return (
    `<span style="display:inline-block;font-family:${FONT_MONO};font-size:11px;font-weight:700;` +
    `text-transform:uppercase;letter-spacing:1px;padding:3px 10px;border-radius:3px;` +
    `background:${tint(accent, 0.85)};color:${esc(accent)};">${esc(label)}</span>`
  );
}

function articleImage(url: string | null | undefined, alt: string, show: boolean): string {
  if (!show) return "";
  const src = safeImageSrc(url);
  if (!src) return "";
  return (
    `<img src="${src}" alt="${esc(alt)}" width="${CONTENT_WIDTH}" ` +
    `style="display:block;width:100%;max-width:${CONTENT_WIDTH}px;height:auto;border-radius:8px;margin-bottom:14px;" />`
  );
}

function readArticleLink(accent: string, labels: Labels, url?: string, source?: string): string {
  if (!isHttpUrl(url)) return "";
  return (
    `<p style="font-size:12px;color:${STONE_500};margin:10px 0 0 0;">` +
    `<a href="${safeHref(url)}" style="color:${esc(accent)};">${esc(labels.readArticle)}</a>` +
    (source ? ` · ${esc(source)}` : "") +
    "</p>"
  );
}

function renderRadarSection(accent: string, items: EditionItem[], showImage: boolean, labels: Labels): string {
  const cards = items
    .map((item, i) => {
      const isLast = i === items.length - 1;
      const inner =
        articleImage(item.image_url, item.title, showImage) +
        tagPill(accent, item.tag) +
        `<div><a href="${safeHref(item.url)}" style="font-family:${FONT_SERIF};font-size:19px;color:${STONE_900};` +
        `text-decoration:none;display:block;margin:8px 0;line-height:1.35;">${esc(item.title)}</a></div>` +
        (item.summary
          ? `<p style="font-size:15px;color:${STONE_700};line-height:1.7;margin:0 0 10px 0;">${esc(item.summary)}</p>`
          : "") +
        (item.takeaway
          ? `<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="background:${tint(
              accent,
              0.9
            )};border-radius:8px;padding:12px 16px;"><div style="font-size:14px;color:${STONE_700};line-height:1.6;">` +
            `&rarr; ${esc(item.takeaway)}</div></td></tr></table>`
          : "") +
        (item.source ? `<p style="font-size:12px;color:${STONE_500};margin:8px 0 0 0;">${esc(item.source)}</p>` : "");
      return `<div style="${
        isLast ? "" : `padding-bottom:24px;margin-bottom:24px;border-bottom:1px dashed ${STONE_300};`
      }">${inner}</div>`;
    })
    .join("");

  return (
    sectionHeader(accent, labels.sections.radar.eyebrow, labels.sections.radar.title) +
    `<tr><td style="padding:20px ${PAD}px 32px;">${cards}</td></tr>`
  );
}

function renderDeepDiveSection(accent: string, deepDive: DeepDive, showImage: boolean, labels: Labels): string {
  const ink = readableOn(accent);
  const parts = deepDive.parts
    .map(
      (p) =>
        (p.heading
          ? `<h4 style="font-family:${FONT_SANS};font-size:15px;font-weight:700;color:${STONE_900};margin:18px 0 6px 0;">${esc(
              p.heading
            )}</h4>`
          : "") +
        `<p style="font-size:15px;color:${STONE_700};line-height:1.75;margin:0 0 10px 0;">${esc(p.body)}</p>`
    )
    .join("");
  const inShort = deepDive.in_short
    ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px;"><tr><td style="background:${esc(
        accent
      )};border-radius:8px;padding:16px 20px;">` +
      `<div style="font-family:${FONT_MONO};font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${ink};font-weight:600;margin-bottom:6px;">${esc(
        labels.inShort
      )}</div>` +
      `<p style="font-size:14.5px;color:${ink};line-height:1.7;margin:0;">${esc(deepDive.in_short)}</p>` +
      "</td></tr></table>"
    : "";

  return (
    sectionHeader(accent, labels.sections.deep_dive.eyebrow, deepDive.title) +
    `<tr><td style="padding:16px ${PAD}px 32px;">` +
    articleImage(deepDive.image_url, deepDive.title, showImage) +
    tagPill(accent, deepDive.tag) +
    parts +
    inShort +
    readArticleLink(accent, labels, deepDive.url, deepDive.source) +
    "</td></tr>"
  );
}

function renderSignalSection(accent: string, items: EditionItem[], labels: Labels): string {
  const list = items
    .map((item, i) => {
      const isLast = i === items.length - 1;
      const inner =
        tagPill(accent, item.tag) +
        `<div><a href="${safeHref(item.url)}" style="font-family:${FONT_SANS};font-size:15px;font-weight:700;` +
        `color:${STONE_900};text-decoration:none;display:block;margin:6px 0;">${esc(item.title)}</a></div>` +
        (item.summary
          ? `<p style="font-size:14px;color:${STONE_700};line-height:1.65;margin:0;">${esc(item.summary)}` +
            (item.source ? ` <span style="color:${STONE_500};">(${esc(item.source)})</span>` : "") +
            "</p>"
          : "");
      return `<div style="${isLast ? "" : `padding-bottom:16px;margin-bottom:16px;border-bottom:1px solid ${STONE_200};`}">${inner}</div>`;
    })
    .join("");

  return (
    sectionHeader(accent, labels.sections.signal.eyebrow, labels.sections.signal.title) +
    `<tr><td style="padding:20px ${PAD}px 32px;">${list}</td></tr>`
  );
}

function renderNumberSection(accent: string, number: NumberHighlight, labels: Labels): string {
  const ink = readableOn(accent);
  return (
    sectionHeader(accent, labels.sections.number.eyebrow, labels.sections.number.title) +
    `<tr><td style="padding:20px ${PAD}px 32px;">` +
    `<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="background:${esc(
      accent
    )};padding:32px 24px;border-radius:12px;text-align:center;">` +
    `<div style="font-family:${FONT_SERIF};font-size:48px;color:${ink};letter-spacing:-1px;line-height:1.1;">${esc(
      number.value
    )}</div>` +
    (number.label ? `<div style="font-size:14px;color:${ink};font-weight:600;margin-top:8px;">${esc(number.label)}</div>` : "") +
    (number.context
      ? `<div style="font-size:13.5px;color:${ink};line-height:1.6;margin-top:10px;">${esc(number.context)}</div>`
      : "") +
    "</td></tr></table>" +
    readArticleLink(accent, labels, number.url, number.source) +
    "</td></tr>"
  );
}

function renderPickSection(accent: string, pick: PickItem, labels: Labels): string {
  const ink = readableOn(accent);
  return (
    sectionHeader(accent, labels.sections.pick.eyebrow, labels.sections.pick.title) +
    `<tr><td style="padding:20px ${PAD}px 32px;">` +
    `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${STONE_200};border-radius:10px;"><tr><td style="padding:24px;">` +
    (pick.kind
      ? `<div style="margin-bottom:12px;"><span style="font-family:${FONT_MONO};font-size:11px;text-transform:uppercase;` +
        `letter-spacing:1.5px;color:${esc(accent)};font-weight:600;background:${tint(
          accent,
          0.85
        )};padding:3px 10px;border-radius:3px;">${esc(pick.kind)}</span></div>`
      : "") +
    `<div style="font-family:${FONT_SERIF};font-size:18px;color:${STONE_900};margin:0 0 10px 0;line-height:1.35;">${esc(
      pick.title
    )}</div>` +
    (pick.why ? `<p style="font-size:14.5px;color:${STONE_700};line-height:1.7;margin:0 0 16px 0;">${esc(pick.why)}</p>` : "") +
    (isHttpUrl(pick.url)
      ? `<a href="${safeHref(pick.url)}" style="display:inline-block;background:${esc(accent)};color:${ink};` +
        `font-size:13px;font-weight:600;padding:10px 20px;border-radius:6px;text-decoration:none;font-family:${FONT_SANS};">${esc(
          labels.readArticle
        )}</a>`
      : "") +
    "</td></tr></table></td></tr>"
  );
}

function tocChips(active: SectionId[], labels: Labels): string {
  const chips = active.map((id) => labels.sections[id].eyebrow);
  const rows: string[][] = [];
  for (let i = 0; i < chips.length; i += 3) rows.push(chips.slice(i, i + 3));
  const rowsHtml = rows
    .map((row) => {
      const width = Math.floor(100 / row.length);
      const cells = row
        .map(
          (label) =>
            `<td width="${width}%" style="padding:4px;"><div style="background:#ffffff;border:1px solid ${STONE_200};` +
            `border-radius:6px;padding:10px 12px;font-size:13px;font-weight:500;color:${STONE_700};text-align:center;">${esc(
              label
            )}</div></td>`
        )
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return (
    `<tr><td style="padding:24px ${PAD}px;background:${STONE_100};">` +
    `<div style="font-family:${FONT_MONO};font-size:11px;text-transform:uppercase;letter-spacing:2px;color:${STONE_500};font-weight:600;margin-bottom:14px;">${esc(
      labels.toc
    )}</div>` +
    `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="table-layout:fixed;">${rowsHtml}</table>` +
    "</td></tr>"
  );
}

function renderEmail(ctx: RenderContext): string {
  const { edition, design, subscriptionName, dateLabel, language } = ctx;
  const labels = labelsFor(language);
  const title = cleanTitle(design.title || subscriptionName);
  const showImages = design.images;
  const ink = readableOn(design.accent);
  const pillBg = ink === "#ffffff" ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.08)";
  const pillBorder = ink === "#ffffff" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.14)";

  // Sections effectivement présentes dans l'édition (le design peut lister
  // une section que le modèle, malgré la spec, n'aurait pas produite pour un
  // canal donné).
  const present = design.sections.filter((s) => {
    if (s === "radar") return !!edition.radar?.length;
    if (s === "deep_dive") return !!edition.deep_dive;
    if (s === "signal") return !!edition.signal?.length;
    if (s === "number") return !!edition.number;
    if (s === "pick") return !!edition.pick;
    return false;
  });

  let body = "";
  body +=
    `<tr><td style="background:${esc(design.accent)};padding:40px ${PAD}px 32px;text-align:center;">` +
    `<div style="font-family:${FONT_SERIF};font-size:32px;color:${ink};letter-spacing:-0.5px;">${esc(title)}</div>` +
    `<div style="margin-top:16px;"><span style="display:inline-block;background:${pillBg};border:1px solid ${pillBorder};` +
    `border-radius:100px;padding:6px 16px;font-family:${FONT_MONO};font-size:12px;color:${ink};font-weight:500;">${esc(
      dateLabel
    )}</span></div>` +
    "</td></tr>";

  body += `<tr><td style="padding:28px ${PAD}px 24px;"><p style="font-size:15.5px;color:${STONE_700};line-height:1.75;margin:0;">${esc(
    edition.intro
  )}</p></td></tr>`;
  body += separator();
  body += tocChips(present, labels);
  body += separator();

  for (const section of present) {
    if (section === "radar" && edition.radar) body += renderRadarSection(design.accent, edition.radar, showImages, labels);
    if (section === "deep_dive" && edition.deep_dive)
      body += renderDeepDiveSection(design.accent, edition.deep_dive, showImages, labels);
    if (section === "signal" && edition.signal) body += renderSignalSection(design.accent, edition.signal, labels);
    if (section === "number" && edition.number) body += renderNumberSection(design.accent, edition.number, labels);
    if (section === "pick" && edition.pick) body += renderPickSection(design.accent, edition.pick, labels);
    body += separator();
  }

  if (edition.outro) {
    body += `<tr><td style="padding:0 ${PAD}px 24px;"><p style="font-size:13px;color:${STONE_500};margin:0;">${esc(
      edition.outro
    )}</p></td></tr>`;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const footerText = appUrl
    ? `<a href="${safeHref(appUrl)}" style="color:${STONE_500};text-decoration:underline;">${esc(labels.footer)}</a>`
    : esc(labels.footer);
  body += `<tr><td style="background:${STONE_900};padding:32px ${PAD}px;text-align:center;"><p style="font-size:12px;color:${STONE_500};line-height:1.6;margin:0;">${footerText}</p></td></tr>`;

  const preheaderText = edition.preheader || edition.intro || "";

  return (
    `<!DOCTYPE html><html lang="${normalizeLanguage(language)}"><head><meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
    `<title>${esc(edition.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${STONE_200};font-family:${FONT_SANS};">` +
    `<div style="display:none;max-height:0;overflow:hidden;font-size:0;line-height:0;color:${STONE_100};opacity:0;">${esc(
      preheaderText
    )}</div>` +
    // Tableau fluide (100 %, plafonné à 600 px) pour que l'édition tienne sur
    // un téléphone. Outlook sur ordinateur ignore `max-width` : la table
    // conditionnelle `mso` lui redonne une largeur fixe.
    `<center><!--[if mso]><table role="presentation" width="${WIDTH}" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:${WIDTH}px;margin:0 auto;background:${STONE_50};">` +
    body +
    "</table><!--[if mso]></td></tr></table><![endif]--></center></body></html>"
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Rendu Slack
// ─────────────────────────────────────────────────────────────────────────

function slackEscape(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function slackHref(url: unknown): string {
  const s = String(url ?? "").trim();
  return isHttpUrl(s) ? slackEscape(s) : "#";
}

function renderSlack(ctx: RenderContext): SlackPayload {
  const { edition, design, subscriptionName, dateLabel } = ctx;
  const title = cleanTitle(design.title || subscriptionName);
  const blocks: unknown[] = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: String(edition.subject || title).substring(0, 150), emoji: false },
  });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `${dateLabel} · ${title}` }] });
  if (edition.intro) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: edition.intro.substring(0, 2900) } });
  }

  for (const item of edition.radar || []) {
    let txt = `*<${slackHref(item.url)}|${slackEscape(item.title)}>*`;
    if (item.summary) txt += `\n${item.summary}`;
    if (item.takeaway) txt += `\n_${item.takeaway}_`;
    blocks.push({ type: "section", text: { type: "mrkdwn", text: txt.substring(0, 2900) } });
  }

  blocks.push({ type: "divider" });

  if (edition.signal?.length) {
    const lines = edition.signal.map(
      (item) => `• <${slackHref(item.url)}|${slackEscape(item.title)}>${item.summary ? " : " + item.summary : ""}`
    );
    blocks.push({ type: "section", text: { type: "mrkdwn", text: lines.join("\n").substring(0, 2900) } });
  }

  if (edition.number) {
    const text = `*${slackEscape(edition.number.value)}* : ${slackEscape(edition.number.label)}\n${slackEscape(
      edition.number.context
    )}`;
    blocks.push({ type: "section", text: { type: "mrkdwn", text: text.substring(0, 2900) } });
  }

  return { text: edition.subject, blocks: blocks.slice(0, 50) };
}

export const editorialTemplate: Template = {
  id: "editorial",
  outputSpec,
  maxOutputTokens,
  validate,
  renderEmail,
  renderSlack,
};
