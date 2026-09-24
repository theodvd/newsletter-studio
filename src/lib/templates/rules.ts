/**
 * Règles de prompt communes aux deux templates ET au moteur, pour ne pas les
 * répéter à plusieurs endroits (chaque template les insère dans sa propre
 * spec ; `engine/prompt.ts` réutilise le rappel JSON dans le prompt utilisateur).
 */

/** URLs : uniquement celles fournies dans les données. */
export const URLS_ONLY_RULE = "Les URLs ne viennent QUE des données fournies ci-dessous, jamais inventées.";

/** Langue de rédaction de l'édition (le contenu, pas la spec elle-même). */
export function languageRule(language: string): string {
  return `Langue de rédaction de l'édition : ${language}.`;
}

/** Rappel de format, répété en fin de prompt système ET de prompt utilisateur. */
export const JSON_ONLY_REMINDER = "Réponds UNIQUEMENT avec le JSON valide : pas de markdown, pas de backticks, pas de texte autour, pas de virgule finale.";
