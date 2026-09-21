/**
 * Détection des conversations anormales dans l'onboarding.
 *
 * Objectif : repérer quelqu'un qui cherche à détourner l'agent, pas juger le
 * contenu des veilles. Trois familles seulement, choisies parce qu'elles ont un
 * taux de faux positifs très bas : personne ne demande « quelle est ta clé
 * API » en configurant une veille sur la fintech.
 *
 * Volontairement déterministe, sans appel de modèle : un détecteur qui coûte de
 * l'argent à chaque message serait lui-même un vecteur d'abus, et un détecteur
 * non reproductible est impossible à régler.
 *
 * Ce qui n'est PAS détecté ici, et c'est assumé : les contenus illégaux ou
 * violents, déjà filtrés par le fournisseur du modèle.
 */

export type AbuseCategory = "prompt_injection" | "credential_probe" | "internal_probe";

export type AbuseSignal = {
  category: AbuseCategory;
  /** L'extrait qui a déclenché, pour que la personne qui lit comprenne tout de suite. */
  evidence: string;
  weight: number;
};

export type AbuseVerdict = {
  flagged: boolean;
  score: number;
  signals: AbuseSignal[];
  /** Résumé lisible, utilisé comme objet de l'alerte. */
  summary: string;
};

/** Seuil de signalement. Un seul signal fort suffit. */
const THRESHOLD = 3;

type Rule = { category: AbuseCategory; pattern: RegExp; weight: number };

const RULES: Rule[] = [
  // ── Tentatives de détournement de l'agent ────────────────────────────────
  { category: "prompt_injection", weight: 3, pattern: /\bignore\s+(all\s+|your\s+|the\s+|previous\s+|above\s+)*(instruction|prompt|rule|direction)/i },
  { category: "prompt_injection", weight: 3, pattern: /\b(oublie|ignore)\s+(tes|les|toutes)\s+(instruction|consigne|règle|regle)/i },
  { category: "prompt_injection", weight: 3, pattern: /\b(system|initial|original)\s+prompt\b/i },
  { category: "prompt_injection", weight: 3, pattern: /\bprompt\s+(système|systeme)\b/i },
  { category: "prompt_injection", weight: 3, pattern: /\b(reveal|show|print|repeat|output|dis-moi)\s+(me\s+)?(your|the|tes|ton)\s+(instruction|prompt|system|rule)/i },
  { category: "prompt_injection", weight: 3, pattern: /\brepeat\s+(the\s+)?(text|words|everything)\s+above\b/i },
  { category: "prompt_injection", weight: 2, pattern: /\b(you\s+are\s+now|tu\s+es\s+maintenant|pretend\s+(to\s+be|you)|fais\s+semblant\s+d)/i },
  { category: "prompt_injection", weight: 3, pattern: /\b(jailbreak|DAN\s+mode|developer\s+mode|sudo\s+mode)\b/i },
  { category: "prompt_injection", weight: 2, pattern: /\bdisregard\s+(all\s+|any\s+)?(previous|prior|above)\b/i },

  // ── Recherche de secrets ─────────────────────────────────────────────────
  { category: "credential_probe", weight: 3, pattern: /\b(api[\s_-]?key|clé\s+api|cle\s+api|secret\s+key)\b/i },
  { category: "credential_probe", weight: 3, pattern: /\b(service[\s_-]?role|anon[\s_-]?key|bearer\s+token|access[\s_-]?token)\b/i },
  { category: "credential_probe", weight: 3, pattern: /\b(env(ironment)?\s+variable|variable\s+d'environnement|process\.env|\.env\b)/i },
  { category: "credential_probe", weight: 2, pattern: /\b(sk-ant-|sk-proj-|xoxb-|supabase[\s_-]?key)/i },
  { category: "credential_probe", weight: 2, pattern: /\b(mot\s+de\s+passe|password|credentials?)\b.{0,40}\b(serveur|server|base|database|admin)\b/i },

  // ── Sondage du réseau interne ────────────────────────────────────────────
  { category: "internal_probe", weight: 3, pattern: /\b(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)\b/i },
  { category: "internal_probe", weight: 3, pattern: /\b169\.254\.169\.254\b/ },
  { category: "internal_probe", weight: 3, pattern: /\bhttps?:\/\/(10|127)\.\d{1,3}\.\d{1,3}\.\d{1,3}/i },
  { category: "internal_probe", weight: 3, pattern: /\bhttps?:\/\/192\.168\.\d{1,3}\.\d{1,3}/i },
  { category: "internal_probe", weight: 3, pattern: /\bhttps?:\/\/172\.(1[6-9]|2\d|3[01])\./i },
  { category: "internal_probe", weight: 3, pattern: /\b(file|gopher|dict|ftp):\/\//i },
  // Un hôte sans point suivi d'un port ne peut désigner qu'une machine du
  // réseau interne : un domaine public contient toujours un point.
  { category: "internal_probe", weight: 3, pattern: /\bhttps?:\/\/[a-z0-9-]+:\d{2,5}\//i },
];

const LABELS: Record<AbuseCategory, string> = {
  prompt_injection: "tentative de détournement de l'agent",
  credential_probe: "recherche de secrets",
  internal_probe: "sondage du réseau interne",
};

/** Extrait court autour du motif, pour rendre l'alerte lisible. */
function excerpt(text: string, match: RegExpMatchArray): string {
  const at = match.index ?? 0;
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + match[0].length + 60);
  return (start > 0 ? "..." : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "..." : "");
}

/**
 * Analyse les messages de l'utilisateur d'une conversation.
 * Seuls les tours « user » sont examinés : ce que le modèle répond n'est pas
 * le comportement qu'on surveille, et le contenu rapatrié par les outils
 * proviendrait de sites tiers, pas de la personne.
 */
export function detectAbuse(messages: Array<{ role: string; content: unknown }>): AbuseVerdict {
  const signals: AbuseSignal[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.role !== "user") continue;

    const text =
      typeof message.content === "string"
        ? message.content
        : Array.isArray(message.content)
        ? message.content
            .map((part: unknown) =>
              typeof part === "object" && part !== null && "text" in part ? String((part as { text: unknown }).text) : ""
            )
            .join(" ")
        : "";

    if (!text) continue;

    for (const rule of RULES) {
      const match = text.match(rule.pattern);
      if (!match) continue;
      const key = `${rule.category}:${match[0].toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      signals.push({ category: rule.category, evidence: excerpt(text, match), weight: rule.weight });
    }
  }

  const score = signals.reduce((sum, s) => sum + s.weight, 0);
  const categories = Array.from(new Set(signals.map((s) => s.category)));
  const summary = categories.map((c) => LABELS[c]).join(", ") || "aucun signal";

  return { flagged: score >= THRESHOLD, score, signals, summary };
}
