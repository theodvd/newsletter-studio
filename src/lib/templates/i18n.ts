/**
 * Textes localisés des templates (français / anglais, repli sur l'anglais
 * pour toute autre langue) et formatage de la date d'édition.
 *
 * Le contenu de l'édition (ce que le modèle écrit) suit la langue de la
 * veille ; ces libellés couvrent uniquement l'habillage fixe autour
 * (en-têtes de section, sommaire, pied de page).
 */

import type { SectionId } from "./types";

export type Language = "fr" | "en";

/** Ramène n'importe quel code de langue à `fr` ou `en` (repli anglais). */
export function normalizeLanguage(language: string | null | undefined): Language {
  return String(language || "")
    .trim()
    .toLowerCase()
    .startsWith("fr")
    ? "fr"
    : "en";
}

type SectionLabel = { eyebrow: string; title: string };

export type Labels = {
  /** « Au sommaire ». */
  toc: string;
  /** Libellé de l'encadré de synthèse du deep dive. */
  inShort: string;
  /** Texte des liens vers l'article source. */
  readArticle: string;
  /** Ligne de pied de page. */
  footer: string;
  sections: Record<SectionId, SectionLabel>;
};

const LABELS: Record<Language, Labels> = {
  fr: {
    toc: "Au sommaire",
    inShort: "En clair",
    readArticle: "Lire l'article",
    footer: "Rédigé par Lia, Newsletter Studio",
    sections: {
      radar: { eyebrow: "Le Radar", title: "3 signaux à capter" },
      deep_dive: { eyebrow: "Le Deep Dive", title: "" },
      signal: { eyebrow: "Le Signal", title: "À retenir en 30 secondes" },
      number: { eyebrow: "Le Chiffre", title: "Le nombre de la semaine" },
      pick: { eyebrow: "La Reco", title: "À ne pas manquer" },
    },
  },
  en: {
    toc: "In this issue",
    inShort: "In short",
    readArticle: "Read the article",
    footer: "Written by Lia, Newsletter Studio",
    sections: {
      radar: { eyebrow: "The Radar", title: "3 signals to catch" },
      deep_dive: { eyebrow: "Deep Dive", title: "" },
      signal: { eyebrow: "The Signal", title: "In 30 seconds" },
      number: { eyebrow: "The Number", title: "Number of the week" },
      pick: { eyebrow: "The Pick", title: "Worth your time" },
    },
  },
};

/** Libellés localisés à utiliser pour une veille écrite dans `language`. */
export function labelsFor(language: string | null | undefined): Labels {
  return LABELS[normalizeLanguage(language)];
}

/**
 * Date de l'édition, déjà formatée dans la langue de la veille.
 * fr : « lundi 21 septembre 2026 », première lettre mise en capitale.
 * en : « Monday, September 21, 2026 » (format natif Intl, déjà capitalisé).
 */
export function formatEditionDate(
  now: Date,
  language: string,
  timeZone: string = process.env.ENGINE_TIMEZONE || "Europe/Paris"
): string {
  const lang = normalizeLanguage(language);
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  if (lang !== "fr") return formatted;
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
