import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { DEFAULT_MODELS, looksLikeValidKey, type LlmProvider } from "@/lib/engine/llm";

/**
 * Clé API du fournisseur, fournie par l'utilisateur (BYOK).
 *
 * POST   { provider, apiKey } : vérifie, chiffre et enregistre
 * DELETE                      : retire la clé
 *
 * La clé n'est jamais renvoyée au navigateur : le profil n'expose qu'un indice
 * (les quatre derniers caractères) pour que l'utilisateur reconnaisse laquelle
 * est enregistrée. Le stockage est chiffré en AES-256-GCM.
 */

const PROVIDERS: LlmProvider[] = ["anthropic", "openai"];

/**
 * Appel minimal pour vérifier que la clé fonctionne vraiment.
 * Mieux vaut échouer ici, avec un message clair, que silencieusement à
 * 8 heures du matin le jour de la première édition.
 */
async function keyWorks(provider: LlmProvider, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
        },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          model: DEFAULT_MODELS.anthropic,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (res.ok) return { ok: true };
      const data = await res.json().catch(() => null);
      return { ok: false, error: data?.error?.message || `Anthropic a répondu ${res.status}.` };
    }

    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => null);
    return { ok: false, error: data?.error?.message || `Le fournisseur a répondu ${res.status}.` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Vérification impossible." };
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  let body: { provider?: string; apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const provider = String(body.provider || "") as LlmProvider;
  const apiKey = String(body.apiKey || "").trim();

  if (!PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: "Fournisseur inconnu." }, { status: 400 });
  }
  if (!looksLikeValidKey(provider, apiKey)) {
    return NextResponse.json(
      { error: "Cette clé n'a pas le format attendu pour ce fournisseur." },
      { status: 400 }
    );
  }

  const check = await keyWorks(provider, apiKey);
  if (!check.ok) {
    return NextResponse.json({ error: `Clé refusée par le fournisseur : ${check.error}` }, { status: 400 });
  }

  // `profiles` n'est plus modifiable par le client (migration 0003) : cette
  // écriture passe par la clé service, avec filtre de propriété explicite.
  const { error } = await createAdminClient()
    .from("profiles")
    .update({
      llm_provider: provider,
      llm_key_encrypted: encryptSecret(apiKey),
      llm_key_hint: apiKey.slice(-4),
    })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, provider, hint: apiKey.slice(-4) });
}

export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { error } = await createAdminClient()
    .from("profiles")
    .update({ llm_provider: null, llm_key_encrypted: null, llm_key_hint: null })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
