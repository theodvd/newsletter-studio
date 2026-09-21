/**
 * Orchestration : produit et envoie une édition pour une veille.
 * Remplace l'enchaînement des 22 nœuds du workflow n8n « Veille Engine ».
 */

import { decryptSecret } from "@/lib/crypto";
import { safeFetchText } from "@/lib/tools/safe-fetch";
import { loadConfig, logDelivery } from "./config";
import { generateDigestText, type LlmCredentials, type LlmProvider } from "./llm";
import { parseAndFilter, type FetchedSource } from "./parse";
import { buildPrompt, dateEdition, parseDigest } from "./prompt";
import { sendEmail, sendSlack } from "./send";
import type { RunOutcome, SourceFetchTarget, SubscriptionConfig } from "./types";

/** Récupère toutes les sources en parallèle, à travers la garde anti-SSRF. */
async function fetchSources(config: SubscriptionConfig): Promise<FetchedSource[]> {
  const targets: SourceFetchTarget[] = (config.sources || [])
    .filter((s) => s.validation_status !== "invalid")
    .map((s) => ({
      fetchUrl: s.feed_url || s.url,
      sourceUrl: s.url,
      sourceTitle: s.title || s.url,
      sourceType: s.type || "rss",
    }));

  if (targets.length === 0) {
    throw new Error("Aucune source valide pour cette veille.");
  }

  return Promise.all(
    targets.map(async (target) => {
      const res = await safeFetchText(target.fetchUrl);
      return { target, body: res.ok ? res.text : "" };
    })
  );
}

/**
 * Clé du modèle pour cette veille.
 *
 * Le principe du BYOK : chaque utilisateur fournit sa clé, et elle ne sert
 * qu'à ses propres éditions.
 *
 * La clé de secours de l'hébergeur n'est PAS un filet général : elle ne
 * s'applique qu'aux comptes explicitement listés dans
 * `ENGINE_FALLBACK_USER_IDS`. Sans cette restriction, n'importe qui pourrait
 * brancher sa clé, activer sa veille, puis la retirer, et faire payer
 * l'hébergeur indéfiniment. Elle sert à la transition des veilles antérieures
 * au BYOK, et au développement.
 */
function resolveCredentials(config: SubscriptionConfig): LlmCredentials | null {
  const model = process.env.ENGINE_MODEL || null;
  const baseUrl = process.env.ENGINE_OPENAI_BASE_URL || null;

  const stored = config.profiles?.llm_key_encrypted;
  if (stored) {
    return {
      provider: (config.profiles?.llm_provider as LlmProvider) || "anthropic",
      apiKey: decryptSecret(stored),
      model,
      baseUrl,
    };
  }

  const fallback = process.env.ENGINE_FALLBACK_API_KEY;
  if (!fallback) return null;

  const allowed = (process.env.ENGINE_FALLBACK_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!allowed.includes(config.user_id)) return null;

  return {
    provider: (process.env.ENGINE_FALLBACK_PROVIDER as LlmProvider) || "anthropic",
    apiKey: fallback,
    model,
    baseUrl,
  };
}

/**
 * Produit et envoie une édition.
 * Ne lève jamais : tout échec devient une `delivery` en erreur, visible par
 * l'utilisateur dans son historique, plutôt qu'une panne silencieuse.
 */
export async function runSubscription(subscriptionId: string, now: Date = new Date()): Promise<RunOutcome> {
  let config: SubscriptionConfig;
  try {
    config = await loadConfig(subscriptionId);
  } catch (e) {
    return { subscriptionId, status: "error", reason: e instanceof Error ? e.message : "config illisible" };
  }

  const fail = async (reason: string): Promise<RunOutcome> => {
    await logDelivery({ subscriptionId, status: "error", error: reason, digest: null, articles: [] });
    return { subscriptionId, status: "error", reason };
  };

  const credentials = resolveCredentials(config);
  if (!credentials) {
    // Sans clé, rien ne peut être produit. On n'écrit pas de delivery en
    // erreur à chaque tick : ce serait du bruit, pas une panne.
    return { subscriptionId, status: "skipped", reason: "Aucune clé API configurée pour ce compte." };
  }

  let fetched: FetchedSource[];
  try {
    fetched = await fetchSources(config);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "récupération des sources impossible");
  }

  const { articles, lookback, cutoff } = parseAndFilter(
    fetched,
    config.delivered_items || [],
    config.frequency_cron,
    now
  );

  if (articles.length === 0) {
    // Pas d'article frais : on préfère ne rien envoyer plutôt que de recycler
    // du vieux contenu. Ce n'est pas une erreur.
    console.log(
      `[engine] ${subscriptionId} : aucun article frais (fenêtre ${lookback}h, seuil ${cutoff.toISOString()}).`
    );
    return { subscriptionId, status: "skipped", reason: "Aucun article frais." };
  }

  const { system, user } = buildPrompt(config, articles, now);

  let generated;
  try {
    generated = await generateDigestText(credentials, system, user);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "appel du modèle en échec");
  }

  let digest;
  try {
    digest = parseDigest(generated.text);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "réponse du modèle invalide");
  }

  const ctx = {
    digest,
    subject: digest.subject,
    dateEdition: dateEdition(now),
    subscriptionName: config.name,
  };

  const sent =
    config.channel === "slack"
      ? await sendSlack(ctx, config.destination)
      : await sendEmail(ctx, config.profiles?.email || "");

  if (!sent.ok) {
    // L'édition est perdue, mais les articles NE sont PAS marqués envoyés :
    // ils repartiront à la prochaine édition réussie.
    return fail(sent.error);
  }

  await logDelivery({ subscriptionId, status: "success", error: null, digest, articles });

  return {
    subscriptionId,
    status: "success",
    itemsSent: digest.items.length,
    inputTokens: generated.inputTokens,
    outputTokens: generated.outputTokens,
  };
}
