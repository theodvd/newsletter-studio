import Anthropic from "@anthropic-ai/sdk";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { LIA_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { exaSearch, exaFindSimilar } from "@/lib/tools/exa";
import { validateSource } from "@/lib/tools/validate-source";
import { encryptSecret } from "@/lib/crypto";
import { validateCron } from "@/lib/cron";
import { costUsd } from "@/lib/pricing";
import { checkSpendAllowed } from "@/lib/usage";
import { detectAbuse } from "@/lib/abuse/detect";
import { reportAbuse } from "@/lib/abuse/report";
import { LIMITS } from "@/lib/plan";
import { decodeHtmlEntities } from "@/lib/text/decode-entities";
import { resolveSubscriptionIdCandidates } from "@/lib/agent/resolve-subscription-id";
import { mergeDesignInput, type SetDesignInput } from "@/lib/agent/set-design";
import { resolveDesignForSubscription } from "@/lib/templates/design";
import { capConversationHistory, filterVisibleMessages, MAX_HISTORY_MESSAGES } from "@/lib/agent/history";

export const maxDuration = 120;

/**
 * Route de l'agent d'onboarding « Lia ».
 * Boucle agentique : Claude stream ses tokens en SSE, appelle ses tools côté
 * serveur, jusqu'à une réponse finale. Le client lit les événements au fil de l'eau.
 *
 * Événements SSE émis (une ligne "data: {json}\n\n" par événement) :
 *   { type: "delta", text }            : token de texte
 *   { type: "status", label }          : tool en cours
 *   { type: "draft", draft, subscriptionId } : après un save réussi
 *   { type: "done", subscriptionId, usage } : fin de la réponse
 *   { type: "error", message }         : erreur fatale
 */

const TOOLS: Anthropic.Tool[] = [
  {
    name: "validate_source",
    description:
      "Vérifie qu'une source est récupérable : détecte le flux RSS (autodiscovery), sa fraîcheur, ou classe la source en 'scrape' (page HTML) / 'error'. À appeler pour chaque source mentionnée.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "URL de la source à valider" } },
      required: ["url"],
    },
  },
  {
    name: "exa_search",
    description: "Recherche sémantique de sources d'information sur un sujet (sites, blogs, médias).",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Sujet recherché, ex: 'actualités private equity France'" } },
      required: ["query"],
    },
  },
  {
    name: "exa_find_similar",
    description: "Trouve des sites similaires à une URL donnée (pour proposer des sources complémentaires).",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "URL de référence" } },
      required: ["url"],
    },
  },
  {
    name: "save_subscription_config",
    description:
      "Sauvegarde (ou met à jour) le brouillon de la veille en base. À appeler dès que l'essentiel est connu, puis à chaque modification. Alimente l'encart de récap affiché à l'utilisateur.",
    input_schema: {
      type: "object",
      properties: {
        subscription_id: { type: "string", description: "Id du brouillon existant à mettre à jour (omis à la création)" },
        name: { type: "string", description: "Nom court de la veille, ex: 'Veille marchés financiers'" },
        profile_prompt: { type: "string", description: "Résumé riche du profil et des besoins (sert à personnaliser chaque édition)" },
        frequency_cron: { type: "string", description: "Fréquence en cron 5 champs, ex: '0 7 * * 1-5'" },
        channel: { type: "string", enum: ["slack", "email"] },
        destination: { type: "string", description: "LAISSER VIDE dans tous les cas. Email : le digest part automatiquement vers l'adresse du compte connecté (anti-spam, non modifiable). Slack : l'utilisateur connectera son workspace via le bouton « Connect Slack » du récap." },
        tone: { type: "string" },
        language: { type: "string", description: "Code langue, ex: 'fr'" },
        sources: {
          type: "array",
          description: "Liste COMPLÈTE des sources retenues (remplace l'existant)",
          items: {
            type: "object",
            properties: {
              url: { type: "string" },
              feed_url: { type: "string", description: "URL du flux RSS résolu (null si scrape/api)" },
              title: { type: "string" },
              type: { type: "string", enum: ["rss", "scrape", "api"] },
              api_key: { type: "string", description: "Clé API si la source en nécessite une (sera chiffrée)" },
              added_by: { type: "string", enum: ["user", "lia"] },
            },
            required: ["url", "type"],
          },
        },
      },
      required: ["name", "profile_prompt", "frequency_cron", "channel", "sources"],
    },
  },
  {
    name: "set_design",
    description:
      "Changes how the digest LOOKS: template, accent colour, header title, active sections (editorial only) and article images. All fields optional: only what's given changes, everything else keeps its current value. Call this whenever the user asks to change colours, layout, template, sections shown, or images. Never say design can't be changed: this tool does it.",
    input_schema: {
      type: "object",
      properties: {
        subscription_id: { type: "string", description: "Id of the digest to update (omitted when editing the digest already in context)" },
        template: { type: "string", enum: ["editorial", "classic"], description: "editorial: richer, sectioned layout. classic: a simple list of articles." },
        accent: { type: "string", description: "Accent colour driving the header and highlights, hex format #RRGGBB" },
        title: {
          anyOf: [{ type: "string" }, { type: "null" }],
          description: "Header title shown at the top of the digest. Pass null to fall back to the digest's name.",
        },
        sections: {
          type: "array",
          description: "Ordered list of active sections, editorial template only. Ignored by classic.",
          items: { type: "string", enum: ["radar", "deep_dive", "signal", "number", "pick"] },
        },
        images: { type: "boolean", description: "Show article images in the digest" },
      },
    },
  },
];

type SaveConfigInput = {
  subscription_id?: string;
  name: string;
  profile_prompt: string;
  frequency_cron: string;
  channel: "slack" | "email";
  destination?: string;
  tone?: string;
  language?: string;
  sources: Array<{
    url: string;
    feed_url?: string;
    title?: string;
    type: "rss" | "scrape" | "api";
    api_key?: string;
    added_by?: "user" | "lia";
  }>;
};

async function saveConfig(
  userId: string,
  userEmail: string,
  input: SaveConfigInput,
  knownSubscriptionId: string | null
) {
  const supabase = createClient();

  // Cadence : validée ici, sur TOUS les chemins (création comme édition).
  // Le chemin d'édition poussait auparavant le cron dans le planificateur sans
  // aucun contrôle : « * * * * * » passait, soit ~10 000 exécutions par semaine.
  const cronCheck = validateCron(input.frequency_cron);
  if (!cronCheck.ok) {
    return { saved: false, error: cronCheck.reason };
  }

  // Anti-spam : un digest email ne peut partir que vers l'adresse du compte.
  // Imposé ici (côté serveur), quoi que l'agent ou le client envoient.
  const destination = input.channel === "email" ? userEmail : input.destination || null;
  const row: Record<string, unknown> = {
    user_id: userId,
    // Le modèle écrit parfois l'entité HTML au lieu du caractère (ex. « React
    // Native &amp; AI Dev Weekly ») : décodée avant stockage, jamais après
    // coup, voir `src/lib/text/decode-entities.ts`.
    name: decodeHtmlEntities(input.name),
    profile_prompt: input.profile_prompt,
    frequency_cron: input.frequency_cron,
    channel: input.channel,
    destination,
    tone: input.tone ? decodeHtmlEntities(input.tone) : input.tone ?? null,
    language: input.language ?? "fr",
    status: "draft",
    updated_at: new Date().toISOString(),
  };

  // Les écritures sur `subscriptions` passent par la clé service : les colonnes
  // sensibles (destination, status) ne sont plus accessibles
  // au client, sinon la règle « destination = email du compte » ci-dessus se
  // contourne d'un appel PostgREST direct. La clé service ignorant le RLS, la
  // propriété est vérifiée explicitement, à chaque requête.
  const db = createAdminClient();

  // Résolution de l'id à mettre à jour : voir `resolve-subscription-id.ts`.
  // Corrige le bug du 24/09 (Lia omet subscription_id en édition -> nouveau
  // brouillon créé au lieu d'une mise à jour) en retombant sur l'id déjà
  // connu côté serveur pour ce tour, plutôt que de traiter l'omission comme
  // une création.
  const candidates = resolveSubscriptionIdCandidates({
    inputId: input.subscription_id,
    knownId: knownSubscriptionId,
  });

  let subscriptionId: string | undefined;
  let existing: { destination: string | null; status: string } | null = null;
  for (const candidate of candidates) {
    const { data } = await db
      .from("subscriptions")
      .select("destination, status")
      .eq("id", candidate)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      subscriptionId = candidate;
      existing = data;
      break;
    }
  }

  if (candidates.length > 0 && !subscriptionId) {
    return { saved: false, error: "Digest not found." };
  }

  if (subscriptionId) {
    // Une veille active reste active : on édite en direct, pas de retour en draft
    if (existing && existing.status !== "draft") {
      delete row.status;
    }
    // Ne jamais écraser un webhook Slack déjà connecté par une valeur vide
    if (
      existing?.destination?.startsWith("https://hooks.slack.com") &&
      !String(input.destination || "").startsWith("https://hooks.slack.com")
    ) {
      delete row.destination;
    }
    const { error } = await db
      .from("subscriptions")
      .update(row)
      .eq("id", subscriptionId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

  } else {
    const { data, error } = await db.from("subscriptions").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    subscriptionId = data.id;
  }

  // Les sources sont remplacées en bloc (la liste envoyée fait foi)
  await supabase.from("sources").delete().eq("subscription_id", subscriptionId);
  if (input.sources.length > 0) {
    const { error } = await supabase.from("sources").insert(
      input.sources.map((s) => ({
        subscription_id: subscriptionId,
        url: s.url,
        feed_url: s.feed_url ?? null,
        title: s.title ?? null,
        type: s.type,
        api_key_encrypted: s.api_key ? encryptSecret(s.api_key) : null,
        added_by: s.added_by ?? "user",
        validation_status: s.type === "rss" ? "valid" : "pending",
      }))
    );
    if (error) throw new Error(error.message);
  }
  return { subscription_id: subscriptionId, saved: true };
}

/**
 * Sauvegarde un changement de design (`set_design`) : merge avec le design
 * actuel puis sanitisation complète par `resolveDesign` (voir
 * `mergeDesignInput`), jamais d'écriture d'un input non sanitisé. Ne crée
 * JAMAIS de veille : à la différence de `save_subscription_config`, un design
 * ne s'applique qu'à un brouillon ou une veille qui existe déjà.
 */
async function setDesign(userId: string, input: SetDesignInput, knownSubscriptionId: string | null) {
  const candidates = resolveSubscriptionIdCandidates({
    inputId: input.subscription_id,
    knownId: knownSubscriptionId,
  });
  if (candidates.length === 0) {
    return { saved: false, error: "No digest to update yet: save the digest first." };
  }

  // Écriture serveur uniquement (voir 0007_design.sql) : `design` n'est jamais
  // accordé en écriture au rôle `authenticated`, et la propriété est vérifiée
  // explicitement puisque la clé service ignore le RLS.
  const db = createAdminClient();

  let subscriptionId: string | null = null;
  let row: { design: unknown; frequency_cron: string; status: string } | null = null;
  for (const candidate of candidates) {
    const { data } = await db
      .from("subscriptions")
      .select("design, frequency_cron, status")
      .eq("id", candidate)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) {
      subscriptionId = candidate;
      row = data;
      break;
    }
  }
  if (!subscriptionId || !row) {
    return { saved: false, error: "Digest not found." };
  }

  // Le titre d'en-tête vient du modèle comme `name`/`tone` : mêmes entités
  // HTML à décoder avant stockage (voir `saveConfig`).
  const decodedTitle = input.title === undefined || input.title === null ? input.title : decodeHtmlEntities(input.title);

  const current = resolveDesignForSubscription(row);
  const resolved = mergeDesignInput(current, { ...input, title: decodedTitle }, row.frequency_cron);

  const { error } = await db
    .from("subscriptions")
    .update({ design: resolved, updated_at: new Date().toISOString() })
    .eq("id", subscriptionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return { subscription_id: subscriptionId, saved: true, design: resolved };
}

/** Libellé lisible pour la pastille de statut dans le fil de chat. */
function toolStatusLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "validate_source": {
      try {
        const hostname = new URL(String(input.url)).hostname.replace(/^www\./, "");
        return `Checking ${hostname}…`;
      } catch {
        return "Checking source…";
      }
    }
    case "exa_search":
      return `Searching sources: "${input.query}"…`;
    case "exa_find_similar":
      return "Finding similar sources…";
    case "save_subscription_config":
      return "Updating your digest…";
    case "set_design":
      return "Updating your digest's design…";
    default:
      return "Working…";
  }
}

async function runTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
  userEmail: string,
  knownSubscriptionId: string | null
): Promise<unknown> {
  switch (name) {
    case "validate_source":
      return validateSource(String(input.url));
    case "exa_search":
      return exaSearch(String(input.query));
    case "exa_find_similar":
      return exaFindSimilar(String(input.url));
    case "save_subscription_config":
      return saveConfig(userId, userEmail, input as unknown as SaveConfigInput, knownSubscriptionId);
    case "set_design":
      return setDesign(userId, input as unknown as SetDesignInput, knownSubscriptionId);
    default:
      return { error: `Tool inconnu: ${name}` };
  }
}

/** Émet un événement SSE formaté dans le stream (silencieux si le client a coupé). */
function sseEvent(
  controller: ReadableStreamDefaultController,
  payload: Record<string, unknown>
) {
  try {
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  } catch {
    // Le client a fermé la connexion (Stop) : on n'interrompt pas la boucle serveur ici,
    // c'est le check request.signal.aborted qui s'en charge proprement.
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: "Non authentifié" })}\n\n`,
      { status: 401, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const limits = LIMITS;

  // L'onboarding tourne sur la clé de l'hébergeur : on borne AVANT d'appeler
  // le modèle, par utilisateur ET globalement. Les éditions, elles, tournent
  // sur la clé de l'utilisateur et ne sont pas concernées.
  const verdict = await checkSpendAllowed(supabase);
  if (!verdict.allowed) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", message: verdict.reason })}\n\n`,
      { status: 429, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const { messages, subscriptionId: knownSubscriptionId } = await request.json();

  // Surveillance des conversations anormales : détournement de l'agent,
  // recherche de secrets, sondage du réseau interne. On n'enregistre la
  // conversation QUE si elle est signalée, et on ne bloque pas : un faux
  // positif ne doit pas empêcher quelqu'un de configurer sa veille. Le
  // signalement part en arrière-plan pour ne pas retarder la réponse.
  const abuse = detectAbuse(Array.isArray(messages) ? messages : []);
  if (abuse.flagged) {
    void reportAbuse({
      userId: user.id,
      email: user.email ?? "inconnu",
      verdict: abuse,
      messages: Array.isArray(messages) ? messages : [],
    });
  }

  // Contexte de la config existante (mode édition d'une veille active comprise)
  let configContext = "";
  if (knownSubscriptionId) {
    const { data: current } = await supabase
      .from("subscriptions")
      .select(
        "id, name, status, channel, destination, destination_label, frequency_cron, tone, language, profile_prompt, design, sources(url, feed_url, title, type, validation_status, added_by)"
      )
      .eq("id", knownSubscriptionId)
      .maybeSingle();
    if (current) {
      const masked = {
        ...current,
        destination: current.destination?.startsWith("https://hooks.slack.com")
          ? "(slack webhook connected)"
          : current.destination,
        // Résolu plutôt que la colonne brute (peut être partielle ou absente
        // sur une vieille ligne) : Lia raisonne sur le design RÉEL appliqué.
        design: resolveDesignForSubscription(current),
      };
      configContext =
        `\n\nConfiguration actuelle de la veille (status: ${current.status}` +
        (current.status === "active"
          ? " (VEILLE EN LIGNE en cours d'édition : chaque save_subscription_config s'applique IMMÉDIATEMENT, y compris la fréquence d'envoi. Confirme clairement chaque changement appliqué.)"
          : "") +
        `) :\n${JSON.stringify(masked)}`;
    }
  }

  // Section dynamique injectée dans le system prompt : les bornes du service
  const planContext = `\n\n## Limites du service\n- Veilles actives max : ${limits.maxActiveDigests}\n- Sources max par veille : ${limits.maxSources}\n- Envois max : 2 par jour (14 par semaine)\n\nIl n'y a pas de plan payant : chaque utilisateur branche sa propre clé API, et ses éditions tournent dessus. Configure DANS ces limites, sans jamais proposer d'abonnement.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Borné aux MAX_HISTORY_MESSAGES derniers messages : reprendre une longue
  // conversation sauvegardée (voir `profiles.keep_history`) ne doit pas faire
  // renvoyer tout l'historique, et donc exploser le coût, à chaque tour.
  const conversation: Anthropic.MessageParam[] = capConversationHistory(
    Array.isArray(messages) ? messages : [],
    MAX_HISTORY_MESSAGES
  );
  let subscriptionId: string | null = knownSubscriptionId ?? null;

  // Cumul des tokens du tour (toutes itérations de tools incluses)
  const usage = { input_tokens: 0, output_tokens: 0 };

  // Conservation optionnelle de la conversation (voir 0009_history.sql) :
  // lue une fois par tour, avec la clé service puisque `keep_history` est
  // hors des colonnes accordées au client (comme `design`, `destination`...).
  const db = createAdminClient();
  const { data: profileHistory } = await db
    .from("profiles")
    .select("keep_history")
    .eq("id", user.id)
    .maybeSingle();
  const keepHistory = profileHistory?.keep_history === true;
  /** Texte assistant visible, cumulé sur toutes les itérations de tools de CE tour. */
  let assistantVisibleText = "";

  const systemPrompt =
    LIA_SYSTEM_PROMPT +
    planContext +
    (subscriptionId
      ? `\n\nConfig en cours : subscription_id=${subscriptionId} (à passer à save_subscription_config et set_design pour les mises à jour, mais peut aussi être omis : le serveur retombe sur cet id).`
      : "") +
    configContext;

  // Le stream SSE est produit par un ReadableStream natif Web
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Boucle agentique : max 10 itérations de tools par tour
        for (let i = 0; i < 10; i++) {
          // L'utilisateur a cliqué Stop : on arrête de consommer des tokens
          if (request.signal.aborted) break;

          // Accumulateurs pour cette itération
          let currentText = "";
          const toolUses: Array<{ id: string; name: string; input: string }> = [];
          /** Type de chaque content_block par index (pour n'émettre le statut que sur les tool_use) */
          const blockTypes: Record<number, string> = {};
          let stopReason: string | null = null;

          // Stream de l'API Anthropic
          const sdkStream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 2000,
            system: systemPrompt,
            tools: TOOLS,
            messages: conversation,
          });

          for await (const event of sdkStream) {
            // Tokens de texte : on les forward immédiatement
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const text = event.delta.text;
              currentText += text;
              sseEvent(controller, { type: "delta", text });
            }

            // Début d'un content_block : mémorise son type
            if (event.type === "content_block_start") {
              blockTypes[event.index] = event.content_block.type;
              if (event.content_block.type === "tool_use") {
                toolUses.push({
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: "",
                });
              }
            }

            // Accumulation du JSON de l'input du tool
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "input_json_delta"
            ) {
              const last = toolUses[toolUses.length - 1];
              if (last) last.input += event.delta.partial_json;
            }

            // Fin d'un content_block tool_use (et seulement tool_use) : on émet le statut
            if (event.type === "content_block_stop" && blockTypes[event.index] === "tool_use") {
              const last = toolUses[toolUses.length - 1];
              if (last) {
                let parsedInput: Record<string, unknown> = {};
                try { parsedInput = JSON.parse(last.input || "{}"); } catch { /* ignore */ }
                sseEvent(controller, {
                  type: "status",
                  label: toolStatusLabel(last.name, parsedInput),
                });
              }
            }

            // Métriques d'usage
            if (event.type === "message_delta" && event.usage) {
              usage.output_tokens += event.usage.output_tokens ?? 0;
            }
            if (event.type === "message_start" && event.message.usage) {
              usage.input_tokens += event.message.usage.input_tokens ?? 0;
            }

            // Stop reason
            if (event.type === "message_delta") {
              stopReason = event.delta.stop_reason ?? null;
            }
          }

          // Reconstruit le contenu de l'assistant pour l'historique de conversation
          const assistantContent: Anthropic.MessageParam["content"] = [];
          if (currentText) {
            (assistantContent as Array<{ type: "text"; text: string }>).push({ type: "text", text: currentText });
            // Texte visible cumulé pour la sauvegarde de conversation (voir plus
            // bas) : un même séparateur que celui inséré entre deux segments
            // dans le flux SSE, pour que ce qui est stocké corresponde
            // exactement à ce qui a été affiché dans une seule bulle assistant.
            assistantVisibleText += (assistantVisibleText && !assistantVisibleText.endsWith("\n") ? "\n\n" : "") + currentText;
          }
          // Parse les inputs finaux des tools
          const parsedToolUses = toolUses.map((tu) => {
            let inputObj: Record<string, unknown> = {};
            try { inputObj = JSON.parse(tu.input || "{}"); } catch { /* ignore */ }
            return { id: tu.id, name: tu.name, input: inputObj };
          });
          for (const tu of parsedToolUses) {
            (assistantContent as Array<{ type: "tool_use"; id: string; name: string; input: Record<string, unknown> }>).push({
              type: "tool_use",
              id: tu.id,
              name: tu.name,
              input: tu.input,
            });
          }

          // Pas de tool_use → réponse finale
          if (stopReason !== "tool_use" || parsedToolUses.length === 0) break;

          conversation.push({ role: "assistant", content: assistantContent });

          // Exécute les tools et collecte les résultats
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of parsedToolUses) {
            let result: unknown;
            try {
              // `subscriptionId` est celui déjà résolu par un save/set_design
              // PRÉCÉDENT de ce même tour (ou celui connu du client) : un tool
              // qui omet subscription_id retombe sur cette valeur plutôt que
              // de créer un doublon (voir `resolve-subscription-id.ts`).
              result = await runTool(tu.name, tu.input, user.id, user.email ?? "", subscriptionId);

              // Après un save ou un set_design réussi : met à jour
              // subscriptionId et recharge le draft. `saved === true`
              // seulement : un résultat d'échec est aussi un objet
              // (`{ saved: false, error }`), sans quoi on écraserait
              // subscriptionId par `undefined` sur un échec.
              if (
                (tu.name === "save_subscription_config" || tu.name === "set_design") &&
                result &&
                typeof result === "object" &&
                (result as { saved?: boolean }).saved === true
              ) {
                const saved = result as { subscription_id: string };
                subscriptionId = saved.subscription_id;

                // Recharge le brouillon complet pour l'event draft
                const { data: freshDraft } = await supabase
                  .from("subscriptions")
                  .select(
                    "id, name, channel, destination, destination_label, frequency_cron, tone, language, status, design, sources(url, feed_url, title, type, validation_status, added_by)"
                  )
                  .eq("id", subscriptionId)
                  .maybeSingle();

                if (freshDraft) {
                  sseEvent(controller, {
                    type: "draft",
                    draft: freshDraft,
                    subscriptionId,
                  });
                }
              }
            } catch (e) {
              result = { error: e instanceof Error ? e.message : "Erreur tool" };
            }
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: JSON.stringify(result),
            });
          }
          conversation.push({ role: "user", content: results });

          // Séparateur de segments si du texte a déjà été émis
          if (currentText && !currentText.endsWith("\n")) {
            sseEvent(controller, { type: "delta", text: "\n\n" });
          }
        }

        // Log de la dépense réelle du tour.
        // Écrit avec la clé service : le compteur ne doit pas être alimentable
        // par le compte qu'il mesure, sinon une ligne à cost_usd négatif annule
        // définitivement le plafond.
        if (usage.input_tokens + usage.output_tokens > 0) {
          await db.from("usage_log").insert({
            user_id: user.id,
            kind: "chat",
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cost_usd: costUsd(usage.input_tokens, usage.output_tokens).toFixed(4),
          });
        }

        // Sauvegarde de la conversation, opt-in (voir 0009_history.sql et
        // `POST /api/settings/history`). Ne stocke jamais les tool_use/tool_result
        // internes : seuls les messages user/assistant en texte, exactement ce
        // que l'utilisateur a vu (voir `filterVisibleMessages`). Si l'utilisateur
        // vient de dire "oui" au milieu de cette même conversation, rien n'est
        // perdu : le prochain tour relira `keep_history` à jour et sauvegardera
        // alors tout l'historique déjà accumulé côté client.
        if (keepHistory && subscriptionId) {
          // Vérification de propriété explicite : `subscriptionId` peut venir
          // du client (`knownSubscriptionId`), la clé service ignorant le RLS.
          const { data: owned } = await db
            .from("subscriptions")
            .select("id")
            .eq("id", subscriptionId)
            .eq("user_id", user.id)
            .maybeSingle();

          if (owned) {
            const visibleMessages = filterVisibleMessages([
              ...(Array.isArray(messages) ? messages : []),
              ...(assistantVisibleText ? [{ role: "assistant", content: assistantVisibleText }] : []),
            ]);
            if (visibleMessages.length > 0) {
              await db.from("conversations").upsert(
                {
                  subscription_id: subscriptionId,
                  user_id: user.id,
                  messages: visibleMessages,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "subscription_id" }
              );
            }
          }
        }

        // Événement final
        sseEvent(controller, { type: "done", subscriptionId, usage });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        sseEvent(controller, { type: "error", message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
