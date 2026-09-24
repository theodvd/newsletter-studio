/**
 * Orchestration : produit et envoie une édition pour une veille.
 * Remplace l'enchaînement des 22 nœuds du workflow n8n « Veille Engine ».
 */

import { decryptSecret } from "@/lib/crypto";
import { safeFetchText } from "@/lib/tools/safe-fetch";
import { allItems, getTemplate, resolveDesign } from "@/lib/templates";
import { formatEditionDate } from "@/lib/templates/i18n";
import type { Edition, RenderContext, SlackPayload, SpecContext } from "@/lib/templates/types";
import { loadConfig, logDelivery } from "./config";
import { enrichImages } from "./images";
import { generateDigestText, type LlmCredentials, type LlmProvider } from "./llm";
import { parseAndFilter, type FetchedSource } from "./parse";
import { buildPrompt, parseEdition } from "./prompt";
import { sendEmail, sendSlack } from "./send";
import type { RunOutcome, SourceFetchTarget, SubscriptionConfig } from "./types";

/** Au-delà, l'editorial (plus long à générer) risque le timeout par défaut. */
const EDITORIAL_TIMEOUT_MS = 240000;

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

export type RunOptions = {
  /** Ne rend et ne parse que : aucun envoi, aucune écriture en base. Pour l'aperçu. */
  dryRun?: boolean;
  /** Court-circuite `resolveCredentials` (aperçu payé par l'hébergeur, à venir). */
  credentials?: LlmCredentials;
  /**
   * Remplace le design enregistré, en aperçu uniquement : sert à montrer un
   * design avant de l'enregistrer. Ignoré hors `dryRun`, pour qu'un envoi
   * réel suive toujours ce qui est en base.
   */
  designOverride?: unknown;
};

/**
 * Produit et envoie une édition.
 * Ne lève jamais : tout échec devient une `delivery` en erreur, visible par
 * l'utilisateur dans son historique, plutôt qu'une panne silencieuse.
 */
export async function runSubscription(
  subscriptionId: string,
  now: Date = new Date(),
  opts: RunOptions = {}
): Promise<RunOutcome> {
  let config: SubscriptionConfig;
  try {
    config = await loadConfig(subscriptionId);
  } catch (e) {
    return { subscriptionId, status: "error", reason: e instanceof Error ? e.message : "config illisible" };
  }

  const fail = async (reason: string): Promise<RunOutcome> => {
    if (!opts.dryRun) {
      await logDelivery({ subscriptionId, status: "error", error: reason, edition: null, articles: [] });
    }
    return { subscriptionId, status: "error", reason };
  };

  const credentials = opts.credentials ?? resolveCredentials(config);
  if (!credentials) {
    // Sans clé, rien ne peut être produit. On n'écrit pas de delivery en
    // erreur à chaque tick : ce serait du bruit, pas une panne.
    return { subscriptionId, status: "skipped", reason: "Aucune clé API configurée pour ce compte." };
  }

  const language = config.language || "fr";
  const design = resolveDesign(
    opts.dryRun && opts.designOverride !== undefined ? opts.designOverride : config.design,
    config.frequency_cron
  );
  const template = getTemplate(design.template);
  const specCtx: SpecContext = { design, channel: config.channel, language };

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

  const { system, user } = buildPrompt(config, articles, now, template, specCtx);

  let generated;
  try {
    generated = await generateDigestText(credentials, system, user, {
      maxTokens: template.maxOutputTokens(specCtx),
      timeoutMs: design.template === "editorial" ? EDITORIAL_TIMEOUT_MS : undefined,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "appel du modèle en échec");
  }

  let edition: Edition;
  try {
    edition = parseEdition(generated.text, template, specCtx);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "réponse du modèle invalide");
  }

  await enrichImages(edition, articles, design);

  const dateLabel = formatEditionDate(now, language);
  const renderCtx: RenderContext = {
    edition,
    design,
    subscriptionName: config.name,
    dateLabel,
    language,
  };

  const itemsSent = allItems(edition).length;

  if (opts.dryRun) {
    // Aperçu : on rend les deux formats (utile pour l'aperçu indépendamment
    // du canal réel de la veille), mais on n'envoie et n'écrit rien.
    const html = template.renderEmail(renderCtx);
    const slack: SlackPayload = template.renderSlack(renderCtx);
    return {
      subscriptionId,
      status: "success",
      itemsSent,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
      preview: { subject: edition.subject, html, slack },
    };
  }

  const sent =
    config.channel === "slack"
      ? await sendSlack(template.renderSlack(renderCtx), config.destination)
      : await sendEmail({ subject: edition.subject, html: template.renderEmail(renderCtx) }, config.profiles?.email || "");

  if (!sent.ok) {
    // L'édition est perdue, mais les articles NE sont PAS marqués envoyés :
    // ils repartiront à la prochaine édition réussie.
    return fail(sent.error);
  }

  await logDelivery({ subscriptionId, status: "success", error: null, edition, articles });

  return {
    subscriptionId,
    status: "success",
    itemsSent,
    inputTokens: generated.inputTokens,
    outputTokens: generated.outputTokens,
  };
}
