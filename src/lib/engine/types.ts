/**
 * Types partagés du moteur de veille.
 *
 * Le moteur vivait dans n8n (workflow « Veille Engine », 22 nœuds). Il est
 * porté ici pour que le projet soit installable, testable et versionné : un
 * nœud Code n8n n'est ni typé, ni testable, ni lisible en revue, et son
 * sandbox réserve des surprises (il n'expose pas `URL`, ce qui a produit une
 * panne silencieuse de 8 jours en juillet 2026).
 */

import type { Edition, SlackPayload } from "@/lib/templates/types";

// Ré-export pratique : le reste du moteur importe `Edition` depuis ici plutôt
// que depuis `@/lib/templates/types`, pour ne pas disperser les imports.
export type { Edition } from "@/lib/templates/types";

/** Une source déclarée par l'utilisateur. */
export type SourceRow = {
  id: string;
  url: string;
  feed_url: string | null;
  title: string | null;
  type: "rss" | "scrape" | "api";
  validation_status: string | null;
};

/** Ligne d'historique servant à la déduplication. */
export type DeliveredItemRow = {
  url: string | null;
  url_hash: string | null;
  title_key: string | null;
};

/** La veille et tout ce qu'il faut pour produire une édition. */
export type SubscriptionConfig = {
  id: string;
  user_id: string;
  name: string;
  profile_prompt: string | null;
  frequency_cron: string;
  channel: "email" | "slack";
  destination: string | null;
  tone: string | null;
  language: string | null;
  status: string;
  /** Réglages de mise en page (colonne `design`, JSONB) : voir `resolveDesign`. */
  design?: unknown;
  sources: SourceRow[];
  delivered_items: DeliveredItemRow[];
  profiles: {
    email: string | null;
    full_name: string | null;
    job_role: string | null;
    llm_provider: string | null;
    llm_key_encrypted: string | null;
  } | null;
};

/** Métadonnées d'une source, portées jusqu'au parsing. */
export type SourceFetchTarget = {
  fetchUrl: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceType: string;
};

/** Un article retenu après parsing, fraîcheur et déduplication. */
export type Article = {
  title: string;
  /** URL d'origine du flux : c'est elle qu'on stocke dans l'historique. */
  url: string;
  /** URL normalisée : clé de déduplication canonique. */
  url_norm: string;
  title_key: string | null;
  summary: string;
  source: string;
  pubDate: string;
  dateConfidence: "confirmed" | "undated";
  /** Image extraite du flux (media:content, enclosure, ou premier <img>). https uniquement. */
  image_url?: string | null;
};

/** Résultat d'une exécution, pour la journalisation et le rapport de tick. */
export type RunOutcome = {
  subscriptionId: string;
  status: "success" | "error" | "skipped";
  reason?: string;
  itemsSent?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Rendu déjà produit, renvoyé seulement en `dryRun` (aperçu, jamais envoyé). */
  preview?: { subject: string; html: string; slack: SlackPayload; edition: Edition };
};
