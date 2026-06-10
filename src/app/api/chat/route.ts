import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIA_SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { exaSearch, exaFindSimilar } from "@/lib/tools/exa";
import { validateSource } from "@/lib/tools/validate-source";
import { encryptSecret } from "@/lib/crypto";

export const maxDuration = 120;

/**
 * Route de l'agent d'onboarding « Lia ».
 * Boucle agentique : Claude répond, appelle ses tools (Exa, validation,
 * sauvegarde du brouillon) côté serveur, jusqu'à une réponse finale.
 * Le client envoie tout l'historique (texte uniquement) à chaque tour.
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
        destination: { type: "string", description: "Adresse email du destinataire (canal email). Pour Slack : LAISSER VIDE — l'utilisateur connectera son workspace via le bouton « Connecter Slack » du récap." },
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

async function saveConfig(userId: string, input: SaveConfigInput) {
  const supabase = createClient();
  const row: Record<string, unknown> = {
    user_id: userId,
    name: input.name,
    profile_prompt: input.profile_prompt,
    frequency_cron: input.frequency_cron,
    channel: input.channel,
    destination: input.destination || null,
    tone: input.tone ?? null,
    language: input.language ?? "fr",
    status: "draft",
    updated_at: new Date().toISOString(),
  };

  let subscriptionId = input.subscription_id;
  if (subscriptionId) {
    // Ne jamais écraser un webhook Slack déjà connecté par une valeur vide
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("destination")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (
      existing?.destination?.startsWith("https://hooks.slack.com") &&
      !String(input.destination || "").startsWith("https://hooks.slack.com")
    ) {
      delete row.destination;
    }
    const { error } = await supabase.from("subscriptions").update(row).eq("id", subscriptionId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from("subscriptions").insert(row).select("id").single();
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

async function runTool(name: string, input: Record<string, unknown>, userId: string): Promise<unknown> {
  switch (name) {
    case "validate_source":
      return validateSource(String(input.url));
    case "exa_search":
      return exaSearch(String(input.query));
    case "exa_find_similar":
      return exaFindSimilar(String(input.url));
    case "save_subscription_config":
      return saveConfig(userId, input as unknown as SaveConfigInput);
    default:
      return { error: `Tool inconnu: ${name}` };
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { messages, subscriptionId: knownSubscriptionId } = await request.json();

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const conversation: Anthropic.MessageParam[] = [...messages];
  let subscriptionId: string | null = knownSubscriptionId ?? null;
  let finalText = "";

  // Boucle agentique : max 10 itérations de tools par tour
  for (let i = 0; i < 10; i++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system:
        LIA_SYSTEM_PROMPT +
        (subscriptionId ? `\n\nBrouillon en cours : subscription_id=${subscriptionId} (à passer à save_subscription_config pour les mises à jour).` : ""),
      tools: TOOLS,
      messages: conversation,
    });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    finalText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    conversation.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let result: unknown;
      try {
        result = await runTool(tu.name, tu.input as Record<string, unknown>, user.id);
        if (tu.name === "save_subscription_config" && result && typeof result === "object") {
          subscriptionId = (result as { subscription_id: string }).subscription_id;
        }
      } catch (e) {
        result = { error: e instanceof Error ? e.message : "Erreur tool" };
      }
      results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
    }
    conversation.push({ role: "user", content: results });
  }

  // Recharge le brouillon pour l'encart de récap côté client
  let draft = null;
  if (subscriptionId) {
    const { data } = await supabase
      .from("subscriptions")
      .select("id, name, channel, destination, destination_label, frequency_cron, tone, language, status, sources(url, feed_url, title, type, validation_status, added_by)")
      .eq("id", subscriptionId)
      .maybeSingle();
    draft = data;
  }

  return NextResponse.json({ reply: finalText, subscriptionId, draft });
}
