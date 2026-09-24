/**
 * Résolution de la colonne `subscriptions.design` en un objet `Design` complet
 * et sûr. Cette fonction ne doit jamais lever : une valeur absente, malformée
 * ou d'un template inconnu retombe sur le rendu classic d'aujourd'hui, pour
 * qu'une ligne créée avant cette colonne (ou une donnée corrompue) continue de
 * produire exactement le digest qu'elle produisait déjà.
 */

import { runsPerWeek } from "@/lib/pricing";
import type { Design, SectionId, TemplateId } from "./types";

const DEFAULT_ACCENT = "#064E3B";
const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_TITLE_LENGTH = 60;

const KNOWN_SECTIONS = new Set<SectionId>(["radar", "deep_dive", "signal", "number", "pick"]);

/** Plus d'un envoi par semaine : format court, pensé pour être lu vite. */
const MULTI_RUN_SECTIONS: SectionId[] = ["radar", "signal", "number"];
/** Un envoi par semaine : format long, la place pour un deep dive et une reco. */
const WEEKLY_SECTIONS: SectionId[] = ["radar", "deep_dive", "signal", "number", "pick"];

function defaultSectionsFor(frequencyCron: string): SectionId[] {
  return runsPerWeek(frequencyCron) > 1 ? MULTI_RUN_SECTIONS : WEEKLY_SECTIONS;
}

function defaultDesign(frequencyCron: string): Design {
  return {
    template: "classic",
    accent: DEFAULT_ACCENT,
    title: null,
    sections: defaultSectionsFor(frequencyCron),
    images: true,
  };
}

function sanitizeAccent(value: unknown): string {
  return typeof value === "string" && ACCENT_RE.test(value) ? value : DEFAULT_ACCENT;
}

function sanitizeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex -- on retire volontairement les caractères de contrôle
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_TITLE_LENGTH);
}

function sanitizeSections(value: unknown, fallback: SectionId[]): SectionId[] {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<SectionId>();
  const kept: SectionId[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || !KNOWN_SECTIONS.has(raw as SectionId)) continue;
    const id = raw as SectionId;
    if (seen.has(id)) continue;
    seen.add(id);
    kept.push(id);
  }
  return kept.length > 0 ? kept : fallback;
}

/**
 * Résout `subscriptions.design` en `Design` complet.
 *
 * `raw` peut être `null`/`undefined` (colonne absente, ou veille créée avant
 * ce step), une valeur qui n'est pas un objet, ou un objet dont le
 * `template` n'est ni `classic` ni `editorial` : dans ces trois cas, on
 * renvoie le design classic par défaut EN ENTIER, sans essayer de récupérer
 * un fragment de l'objet fourni, puisqu'un template inconnu signale une
 * donnée qu'on ne sait pas interpréter avec confiance.
 *
 * Si le template est reconnu, chaque champ est sanitisé indépendamment avec
 * son propre repli (voir `sanitizeAccent`, `sanitizeTitle`, `sanitizeSections`).
 */
export function resolveDesign(raw: unknown, frequencyCron: string): Design {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultDesign(frequencyCron);
  }

  const obj = raw as Record<string, unknown>;
  const template: TemplateId | null =
    obj.template === "classic" || obj.template === "editorial" ? obj.template : null;
  if (!template) {
    return defaultDesign(frequencyCron);
  }

  const fallbackSections = defaultSectionsFor(frequencyCron);
  return {
    template,
    accent: sanitizeAccent(obj.accent),
    title: sanitizeTitle(obj.title),
    sections: sanitizeSections(obj.sections, fallbackSections),
    images: typeof obj.images === "boolean" ? obj.images : true,
  };
}
