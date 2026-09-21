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

const MAX_TOKENS = 3000;
const TIMEOUT_MS = 120000;

/** Vérifie la forme d'une clé avant de la stocker, pour un message utile tout de suite. */
export function looksLikeValidKey(provider: LlmProvider, key: string): boolean {
  const k = String(key || "").trim();
  if (k.length < 20) return false;
  if (provider === "anthropic") return k.startsWith("sk-ant-");
  return k.startsWith("sk-") || k.startsWith("gsk_") || k.startsWith("or-");
}

async function callAnthropic(creds: LlmCredentials, system: string, user: string): Promise<LlmResult> {
  const model = creds.model || DEFAULT_MODELS.anthropic;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": creds.apiKey,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status} : ${data?.error?.message || "erreur inconnue"}`);
  }
  if (data?.stop_reason === "max_tokens") {
    throw new Error(`Réponse tronquée par max_tokens (${data?.usage?.output_tokens ?? "?"} tokens).`);
  }
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Réponse Anthropic vide ou inattendue.");

  return {
    text,
    inputTokens: data?.usage?.input_tokens ?? 0,
    outputTokens: data?.usage?.output_tokens ?? 0,
    model,
  };
}

async function callOpenAiCompatible(creds: LlmCredentials, system: string, user: string): Promise<LlmResult> {
  const model = creds.model || DEFAULT_MODELS.openai;
  const base = (creds.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${creds.apiKey}`,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      max_completion_tokens: MAX_TOKENS,
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
  user: string
): Promise<LlmResult> {
  if (creds.provider === "anthropic") return callAnthropic(creds, system, user);
  return callOpenAiCompatible(creds, system, user);
}
