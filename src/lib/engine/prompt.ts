/**
 * Construction du prompt de l'édition et validation de la réponse du modèle.
 * Porté depuis les nœuds n8n « Construire le prompt » et « Valider la réponse ».
 *
 * Le prompt système est en trois blocs : l'accroche + le profil (ici), suivis
 * du bloc « Format de sortie et règles » que fournit le template actif
 * (`template.outputSpec`). Le fond (quoi écrire) et la forme (comment le
 * mettre en page) sont ainsi découplés, mais les règles vraiment communes aux
 * deux templates (URLs, langue, réponse JSON) vivent dans un seul endroit
 * (`templates/rules.ts`), réutilisé ici et dans chaque spec.
 */

import { JSON_ONLY_REMINDER } from "@/lib/templates/rules";
import type { Edition, SpecContext, Template } from "@/lib/templates/types";
import type { Article, SubscriptionConfig } from "./types";

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MOIS = [
  "janvier", "fevrier", "mars", "avril", "mai", "juin",
  "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
];

export function dateEdition(now: Date = new Date()): string {
  return `${JOURS[now.getDay()]} ${now.getDate()} ${MOIS[now.getMonth()]} ${now.getFullYear()}`;
}

export type PromptPair = { system: string; user: string };

/** Assemble le prompt système et le prompt utilisateur pour une édition. */
export function buildPrompt(
  config: SubscriptionConfig,
  articles: Article[],
  now: Date,
  template: Template,
  specCtx: SpecContext
): PromptPair {
  const bySource: Record<string, Article[]> = {};
  for (const a of articles) {
    const key = a.source || "Autres";
    (bySource[key] = bySource[key] || []).push(a);
  }

  let bloc = "";
  for (const src of Object.keys(bySource)) {
    bloc += "\n## Source : " + src + "\n";
    for (const a of bySource[src]) {
      bloc +=
        "- [" + (a.pubDate || "date inconnue") + "] " + a.title +
        "\n  URL: " + a.url +
        "\n  Resume: " + a.summary + "\n";
    }
  }

  const profileBloc = [
    config.profile_prompt || "Professionnel curieux, pas de profil detaille.",
    config.tone ? "Ton attendu : " + config.tone : "",
    config.profiles?.job_role ? "Metier : " + config.profiles.job_role : "",
  ]
    .filter(Boolean)
    .join("\n");

  const system =
    "Tu es Lia, assistante de veille personnalisee. Tu prepares une edition sur mesure pour un professionnel, a partir des articles agreges depuis ses sources.\n\n" +
    "## Profil du destinataire\n" + profileBloc + "\n\n" +
    template.outputSpec(specCtx);

  const user =
    "Voici les articles agreges depuis les sources du destinataire. Prepare l edition du " +
    dateEdition(now) + ".\n\n" +
    "RAPPEL FRAICHEUR : privilegie les articles avec une date confirmee recente (champ entre crochets).\n\n" +
    "Articles disponibles :\n" + bloc +
    "\n\nRappel : " + JSON_ONLY_REMINDER;

  return { system, user };
}

/**
 * Nettoie, parse et valide la réponse du modèle via le template actif.
 * Même style d'erreur qu'avant le refactor : mieux vaut une delivery en
 * échec, visible dans l'historique, qu'une édition vide envoyée au lecteur.
 */
export function parseEdition(text: string, template: Template, specCtx: SpecContext): Edition {
  if (!text) throw new Error("Réponse du modèle vide.");

  const cleaned = text
    .replace(/^\s*```json\s*/, "")
    .replace(/^\s*```\s*/, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const pos = msg.match(/position (\d+)/)?.[1];
    const ctx = pos
      ? cleaned.substring(Math.max(0, parseInt(pos) - 100), parseInt(pos) + 100)
      : cleaned.substring(0, 400);
    throw new Error("JSON invalide : " + msg + "\nContexte : ..." + ctx + "...");
  }

  return template.validate(parsed, specCtx);
}
