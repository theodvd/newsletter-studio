/**
 * Point d'entrée du module templates : résolution d'un `Template` par id, et
 * aplatissement d'une édition en liste d'articles cités (déduplication,
 * journalisation des envois).
 */

import { classicTemplate } from "./classic";
import { editorialTemplate } from "./editorial";
import type { Edition, Template, TemplateId } from "./types";

export { resolveDesign } from "./design";

/** Résout un identifiant de template en son implémentation. */
export function getTemplate(id: TemplateId): Template {
  return id === "editorial" ? editorialTemplate : classicTemplate;
}

/**
 * Aplatit tous les articles cités dans une édition, tous templates et toutes
 * sections confondus. Sert à la fois pour la déduplication (marquer les
 * articles envoyés) et pour le journal de delivery.
 */
export function allItems(edition: Edition): Array<{ url: string; title: string }> {
  const out: Array<{ url: string; title: string }> = [];
  const push = (url: string | null | undefined, title: string | null | undefined) => {
    if (url) out.push({ url, title: title || "" });
  };

  for (const item of edition.items || []) push(item.url, item.title);
  for (const item of edition.radar || []) push(item.url, item.title);
  if (edition.deep_dive) push(edition.deep_dive.url, edition.deep_dive.title);
  for (const item of edition.signal || []) push(item.url, item.title);
  if (edition.number?.url) push(edition.number.url, edition.number.label);
  if (edition.pick) push(edition.pick.url, edition.pick.title);

  return out;
}
