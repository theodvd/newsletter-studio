/**
 * Appel du modèle, avec la clé de l'utilisateur (BYOK).
 *
 * Pourquoi BYOK : le coût récurrent d'une veille, ce sont les éditions, pas
 * l'onboarding. En laissant chaque utilisateur brancher sa propre clé, le
 * service ne coûte rien à héberger, et le projet peut rester ouvert et gratuit.
 *
 * Deux familles suffisent à couvrir « Claude, GPT ou peu importe » :
 *  - anthropic : l'API Messages
 *  - openai    : tout endpoint compatible OpenAI (OpenAI, Groq, OpenRouter,
 *                Mistral, un modèle local...), d'où le `base_url` paramétrable.
 */

export type LlmProvider = "anthropic" | "openai";

export type LlmCredentials = {
  provider: LlmProvider;
  apiKey: string;
  /** Modèle choisi, sinon le défaut du fournisseur. */
  model?: string | null;
  /** Pour les endpoints compatibles OpenAI autres qu'OpenAI même. */
  baseUrl?: string | null;
  /** Effort de raisonnement (Anthropic, `output_config.effort`) ; absent = défaut du modèle. */
  effort?: string | null;
};

export type LlmResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5",
};

const DEFAULT_MAX_TOKENS = 3000;
const DEFAULT_TIMEOUT_MS = 120000;

/**
 * Modèles Anthropic qui raisonnent sans qu'on le demande : Opus 5 et 5.5,
 * Fable, Mythos et Sonnet 5 pensent par défaut (Opus 5.5 et Fable ne peuvent
 * même pas désactiver la réflexion). Leur réflexion est décomptée du même
 * `max_tokens` que la réponse : sans marge, le plafond calculé pour l'édition
 * seule la tronquerait.
 */
const THINKS_BY_DEFAULT = /^claude-(opus-5|fable|mythos|sonnet-5)/;
/**
 * Marge mesurée : une édition Growfin (5 sections) sur Opus 5.5 en effort high
 * a produit 18 900 tokens, réflexion comprise, pour un plafond d'édition de
 * 10 100. 32 000 de marge laissent de la place un jour chargé ; seuls les
 * tokens réellement produits sont facturés.
 */
const THINKING_HEADROOM_TOKENS = 32000;
/** Ces réponses prennent plusieurs minutes : elles passent en streaming, avec ce délai. */
const THINKING_TIMEOUT_MS = 600000;

function thinks(model: string, effort?: string | null): boolean {
  return THINKS_BY_DEFAULT.test(model) || Boolean(effort);
}

/** Plafond à demander : celui de l'édition, plus la marge de réflexion si le modèle en a besoin. */
export function anthropicMaxTokens(model: string, maxTokens: number, effort?: string | null): number {
  return thinks(model, effort) ? maxTokens + THINKING_HEADROOM_TOKENS : maxTokens;
}

/** Message reconstitué depuis un flux SSE, à la forme d'une réponse non streamée. */
type AssembledMessage = {
  stop_reason: string | null;
  stop_details: { category?: string | null } | null;
  usage: { input_tokens: number; output_tokens: number };
  content: Array<{ type: string; text?: string }>;
};

/**
 * Lit un flux SSE de l'API Messages et le reconstitue en message complet.
 *
 * Pourquoi le streaming : sans lui, aucun octet n'arrive avant la fin de la
 * génération, et fetch (undici) abandonne une requête sans en-têtes au bout
 * de 300 s, quel que soit le délai qu'on lui donne. Un modèle qui réfléchit
 * plusieurs minutes y perdrait des éditions.
 */
export async function readAnthropicStream(body: ReadableStream<Uint8Array>): Promise<AssembledMessage> {
  const msg: AssembledMessage = {
    stop_reason: null,
    stop_details: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    content: [],
  };

  const handle = (event: string, raw: string) => {
    if (!raw) return;
    const data = JSON.parse(raw);
    switch (event || data.type) {
      case "message_start":
        msg.usage.input_tokens = data.message?.usage?.input_tokens ?? 0;
        msg.usage.output_tokens = data.message?.usage?.output_tokens ?? 0;
        break;
      case "content_block_start":
        msg.content[data.index] = { type: data.content_block?.type ?? "unknown", text: data.content_block?.text ?? "" };
        break;
      case "content_block_delta":
        if (data.delta?.type === "text_delta" && msg.content[data.index]) {
          msg.content[data.index].text = (msg.content[data.index].text ?? "") + data.delta.text;
        }
        break;
      case "message_delta":
        msg.stop_reason = data.delta?.stop_reason ?? msg.stop_reason;
        msg.stop_details = data.delta?.stop_details ?? msg.stop_details;
        if (typeof data.usage?.output_tokens === "number") msg.usage.output_tokens = data.usage.output_tokens;
        break;
      case "error":
        throw new Error(`Anthropic (flux) : ${data.error?.message || "erreur inconnue"}`);
    }
  };

  const reader = body.getReader();
  // `stream: true` : un caractère multi-octets coupé entre deux paquets est
  // recollé au paquet suivant au lieu d'être corrompu.
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ? decoder.decode(value, { stream: true }) : decoder.decode();
    // Un événement SSE se termine par une ligne vide ; le dernier peut être incomplet.
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      let event = "";
      const dataLines: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      handle(event, dataLines.join("\n"));
    }
    if (done) break;
  }
  return msg;
}

/**
 * Texte d'une réponse de l'API Messages.
 *
 * Quand le modèle réfléchit, `content` commence par des blocs `thinking`
 * (vides par défaut) : il faut assembler les blocs `text`, pas lire le premier
 * bloc. Un refus (`stop_reason: "refusal"`) n'a pas de texte exploitable.
 */
export function extractAnthropicText(data: unknown): string {
  const d = data as {
    stop_reason?: string;
    stop_details?: { category?: string | null } | null;
    usage?: { output_tokens?: number };
    content?: Array<{ type?: string; text?: string }>;
  } | null;

  if (d?.stop_reason === "refusal") {
    throw new Error(`Le modèle a refusé de produire l'édition (catégorie : ${d.stop_details?.category ?? "non précisée"}).`);
  }
  if (d?.stop_reason === "max_tokens") {
    throw new Error(`Réponse tronquée par max_tokens (${d.usage?.output_tokens ?? "?"} tokens).`);
  }
  const text = (d?.content ?? [])
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!text) throw new Error("Réponse Anthropic vide ou inattendue.");
  return text;
}

export type GenerateOptions = {
  /** Plafond de tokens de sortie ; par défaut celui d'avant les templates (3000). */
  maxTokens?: number;
  /** Délai avant abandon ; l'editorial, plus long à générer, en a besoin de plus. */
  timeoutMs?: number;
};

/** Vérifie la forme d'une clé avant de la stocker, pour un message utile tout de suite. */
export function looksLikeValidKey(provider: LlmProvider, key: string): boolean {
  const k = String(key || "").trim();
  if (k.length < 20) return false;
  if (provider === "anthropic") return k.startsWith("sk-ant-");
  return k.startsWith("sk-") || k.startsWith("gsk_") || k.startsWith("or-");
}

async function callAnthropic(
  creds: LlmCredentials,
  system: string,
  user: string,
  maxTokens: number,
  timeoutMs: number
): Promise<LlmResult> {
  const model = creds.model || DEFAULT_MODELS.anthropic;
  const stream = thinks(model, creds.effort);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": creds.apiKey,
    },
    signal: AbortSignal.timeout(stream ? Math.max(timeoutMs, THINKING_TIMEOUT_MS) : timeoutMs),
    body: JSON.stringify({
      model,
      max_tokens: anthropicMaxTokens(model, maxTokens, creds.effort),
      system,
      messages: [{ role: "user", content: user }],
      // Pas de paramètre `thinking` : les modèles récents raisonnent d'eux-mêmes
      // (adaptatif), et certains refusent toute autre configuration (400).
      ...(creds.effort ? { output_config: { effort: creds.effort } } : {}),
      ...(stream ? { stream: true } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(`Anthropic ${res.status} : ${err?.error?.message || "erreur inconnue"}`);
  }
  const data = stream && res.body ? await readAnthropicStream(res.body) : await res.json().catch(() => null);
  const text = extractAnthropicText(data);

  return {
    text,
    inputTokens: data?.usage?.input_tokens ?? 0,
    outputTokens: data?.usage?.output_tokens ?? 0,
    model,
  };
}

async function callOpenAiCompatible(
  creds: LlmCredentials,
  system: string,
  user: string,
  maxTokens: number,
  timeoutMs: number
): Promise<LlmResult> {
  const model = creds.model || DEFAULT_MODELS.openai;
  const base = (creds.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${creds.apiKey}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Fournisseur ${res.status} : ${data?.error?.message || "erreur inconnue"}`);
  }
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new Error("Réponse tronquée : la limite de tokens a été atteinte.");
  }
  const text = choice?.message?.content;
  if (!text) throw new Error("Réponse du fournisseur vide ou inattendue.");

  return {
    text,
    inputTokens: data?.usage?.prompt_tokens ?? 0,
    outputTokens: data?.usage?.completion_tokens ?? 0,
    model,
  };
}

/** Point d'entrée unique : route vers le bon fournisseur. */
export async function generateDigestText(
  creds: LlmCredentials,
  system: string,
  user: string,
  opts: GenerateOptions = {}
): Promise<LlmResult> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (creds.provider === "anthropic") return callAnthropic(creds, system, user, maxTokens, timeoutMs);
  return callOpenAiCompatible(creds, system, user, maxTokens, timeoutMs);
}
