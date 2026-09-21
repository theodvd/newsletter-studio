/**
 * Construction du prompt de l'édition et validation de la réponse du modèle.
 * Porté depuis les nœuds n8n « Construire le prompt » et « Valider la réponse ».
 */

import type { Article, Digest, SubscriptionConfig } from "./types";

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
  now: Date = new Date()
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

  const isSlack = config.channel === "slack";
  const lang = config.language || "fr";
  const itemCount = isSlack ? "3 a 5" : "5 a 8";

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
    "## Format de sortie\n" +
    "Tu reponds avec un JSON valide, exactement cette structure :\n" +
    "{\n" +
    '  "subject": "Titre court de l edition (avec la thematique, pas de date)",\n' +
    '  "intro": "1-2 phrases d accroche personnalisees pour le destinataire",\n' +
    '  "items": [\n' +
    "    {\n" +
    '      "tag": "categorie courte en minuscules",\n' +
    '      "title": "Titre editorialise et informatif",\n' +
    '      "summary": "2-4 phrases : le fait, le contexte, les chiffres cles",\n' +
    '      "why_it_matters": "1 phrase : pourquoi c est important POUR CE destinataire, vu son metier",\n' +
    '      "url": "URL EXACTE de l article source, copiee depuis les donnees",\n' +
    '      "source": "Nom de la source"\n' +
    "    }\n" +
    "  ],\n" +
    '  "outro": "1 phrase de cloture, ou chaine vide"\n' +
    "}\n\n" +
    "## Regles strictes\n" +
    "1. items contient " + itemCount + " items, classes du plus important au moins important pour ce profil.\n" +
    "2. Chaque info n apparait qu une seule fois. Ne retiens que les sujets pertinents pour le profil.\n" +
    "3. URLs : uniquement celles fournies dans les donnees. JAMAIS d URL inventee.\n" +
    "4. Langue de redaction : " + lang + ".\n" +
    "5. Reponds UNIQUEMENT avec le JSON valide : pas de markdown, pas de backticks, pas de texte autour, pas de virgule finale.\n" +
    "6. Aucun emoji dans le contenu.\n" +
    "7. Sois dense et factuel dans summary ; l analyse personnalisee va dans why_it_matters.";

  const user =
    "Voici les articles agreges depuis les sources du destinataire. Prepare l edition du " +
    dateEdition(now) + ".\n\n" +
    "RAPPEL FRAICHEUR : privilegie les articles avec une date confirmee recente (champ entre crochets).\n\n" +
    "Articles disponibles :\n" + bloc +
    "\n\nRappel : reponds UNIQUEMENT avec le JSON valide, rien d autre.";

  return { system, user };
}

/**
 * Valide et parse la réponse du modèle.
 * Lève une erreur explicite : mieux vaut une delivery en échec, visible dans
 * l'historique, qu'une édition vide envoyée au lecteur.
 */
export function parseDigest(text: string): Digest {
  if (!text) throw new Error("Réponse du modèle vide.");

  const cleaned = text
    .replace(/^\s*```json\s*/, "")
    .replace(/^\s*```\s*/, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: Digest;
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

  const missing = (["subject", "intro", "items"] as const).filter((k) => !parsed[k]);
  if (missing.length > 0) {
    throw new Error("Sections manquantes dans le JSON : " + missing.join(", "));
  }
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new Error("items vide, rien à envoyer.");
  }
  return parsed;
}
