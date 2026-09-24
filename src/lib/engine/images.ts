/**
 * Enrichissement d'une édition en images d'articles, pour le template
 * editorial (le classic n'affiche jamais d'image).
 *
 * Deux sources, dans cet ordre : l'image déjà extraite du flux RSS pendant le
 * parsing (`Article.image_url`), sinon une récupération de la page de
 * l'article pour lire `og:image`/`twitter:image`. Cette deuxième source ne
 * part JAMAIS d'une URL fournie par le modèle : uniquement d'une URL déjà
 * présente dans les articles récupérés depuis les sources de l'utilisateur,
 * et à travers `safeFetchText` (la garde anti-SSRF), comme tout fetch côté
 * serveur sur une donnée externe.
 *
 * Remarque de contrat : `Pick` (« La Reco », dans `templates/types.ts`) n'a
 * pas de champ `image_url` (ce type est fixé par le contrat de templates et
 * ne doit pas changer de signature). Seuls `radar` et `deep_dive` sont donc
 * enrichis ici ; `renderEmail` de l'editorial n'affiche d'ailleurs pas
 * d'image sur la carte Reco.
 */

import type { Article } from "./types";
import { normalizeUrl, UNSUPPORTED_EMAIL_IMAGE } from "./parse";
import { safeFetchText } from "@/lib/tools/safe-fetch";
import type { Design, Edition, EditionItem } from "@/lib/templates/types";

/** Au-delà, on arrête : chaque fetch supplémentaire coûte du temps sur le budget du cron. */
const MAX_IMAGE_FETCHES = 6;

/** Ne lit que le contenu utile (déclarations meta), pas la page entière. */
const MAX_HTML_SCAN_LENGTH = 80000;

function extractMetaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attrPattern = `(?:property|name)=["']${escaped}["']`;
  const contentPattern = `content=["']([^"']+)["']`;

  // L'ordre des attributs varie d'un site à l'autre.
  const afterAttr = html.match(new RegExp(`<meta[^>]*${attrPattern}[^>]*${contentPattern}`, "i"));
  if (afterAttr) return afterAttr[1];
  const beforeAttr = html.match(new RegExp(`<meta[^>]*${contentPattern}[^>]*${attrPattern}`, "i"));
  if (beforeAttr) return beforeAttr[1];
  return null;
}

/** Cherche og:image, og:image:secure_url puis twitter:image, résout les URLs relatives, exige https. */
export function extractOgImage(html: string, baseUrl: string): string | null {
  const head = html.slice(0, MAX_HTML_SCAN_LENGTH);
  const candidates = ["og:image", "og:image:secure_url", "twitter:image"]
    .map((prop) => extractMetaContent(head, prop))
    .filter((v): v is string => !!v);

  for (const raw of candidates) {
    try {
      const resolved = new URL(raw.trim(), baseUrl).toString();
      if (/^https:\/\//i.test(resolved) && !UNSUPPORTED_EMAIL_IMAGE.test(resolved)) return resolved;
    } catch {
      continue;
    }
  }
  return null;
}

/** Ajoute `item` à la file de fetch s'il correspond à un article fourni et n'a pas déjà d'image. */
function consider(
  item: EditionItem | undefined,
  byNorm: Map<string, Article>,
  targets: Array<{ url: string; item: EditionItem }>
): void {
  if (!item || !item.url) return;
  if (item.image_url) return;

  const norm = normalizeUrl(item.url);
  const article = norm ? byNorm.get(norm) : undefined;
  if (!article) return; // jamais une URL que le modèle aurait inventée

  if (article.image_url) {
    item.image_url = article.image_url;
    return;
  }
  targets.push({ url: article.url, item });
}

/**
 * Remplit `image_url` sur les items radar et le deep dive, en place.
 * Ne fait rien pour le template classic ou si `design.images` est faux.
 */
export async function enrichImages(edition: Edition, articles: Article[], design: Design): Promise<void> {
  if (design.template === "classic" || !design.images) return;

  const byNorm = new Map(articles.map((a) => [a.url_norm, a]));
  const targets: Array<{ url: string; item: EditionItem }> = [];

  for (const item of edition.radar || []) consider(item, byNorm, targets);
  if (edition.deep_dive) consider(edition.deep_dive, byNorm, targets);

  await Promise.all(
    targets.slice(0, MAX_IMAGE_FETCHES).map(async ({ url, item }) => {
      try {
        const res = await safeFetchText(url);
        if (!res.ok) return;
        const image = extractOgImage(res.text, url);
        if (image) item.image_url = image;
      } catch {
        // Une image manquante n'empêche jamais l'envoi : on ignore l'échec.
      }
    })
  );
}
