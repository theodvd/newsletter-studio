import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { LIMITS } from "@/lib/plan";
import { costUsd } from "@/lib/pricing";
import { checkSpendAllowed } from "@/lib/usage";
import { resolveDesignForSubscription } from "@/lib/templates/design";
import { canGenerate } from "@/lib/preview/limits";
import { release, tryAcquire } from "@/lib/preview/inflight";
import { buildPreviewPayload, type PreviewSubscription } from "@/lib/preview/payload";
import { runSubscription } from "@/lib/engine/run";

/** Une génération réelle prend 1 à 2 minutes (template editorial compris). */
export const maxDuration = 300;

const SELECT = "id, name, frequency_cron, status, design, language";

/**
 * Charge la veille via le client à SESSION : le RLS garantit déjà qu'on ne
 * voit que ses propres veilles. Toute requête ensuite passée à la clé
 * service (sur `previews`) filtre en plus explicitement par `user_id`,
 * puisque cette clé, elle, ignore le RLS.
 */
async function loadOwnedSubscription(subscriptionId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, sub: null };

  const { data: sub } = await supabase
    .from("subscriptions")
    .select(SELECT)
    .eq("id", subscriptionId)
    .maybeSingle();

  return { user, sub: sub as PreviewSubscription | null };
}

/** Compte, sur les dernières 24h, les générations réelles d'aperçu (une ligne = une génération). */
async function recentGenerationCounts(subscriptionId: string, userId: string) {
  const db = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [bySubscription, byUser] = await Promise.all([
    db
      .from("previews")
      .select("id", { count: "exact", head: true })
      .eq("subscription_id", subscriptionId)
      .eq("user_id", userId)
      .gte("created_at", since),
    db.from("previews").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since),
  ]);

  return { countSubscription24h: bySubscription.count ?? 0, countUser24h: byUser.count ?? 0 };
}

/**
 * GET /api/preview?subscriptionId=<uuid>
 * Aperçu instantané et gratuit : l'édition la plus récemment générée pour
 * cette veille (re-rendue avec le design ACTUEL), ou à défaut un exemple.
 */
export async function GET(request: Request) {
  const subscriptionId = new URL(request.url).searchParams.get("subscriptionId");
  if (!subscriptionId) return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });

  const { user, sub } = await loadOwnedSubscription(subscriptionId);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!sub) return NextResponse.json({ error: "Digest not found" }, { status: 404 });

  const db = createAdminClient();
  const [{ countSubscription24h, countUser24h }, latest] = await Promise.all([
    recentGenerationCounts(subscriptionId, user.id),
    db
      .from("previews")
      .select("edition, created_at, sent_count")
      .eq("subscription_id", subscriptionId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const payload = buildPreviewPayload({
    sub,
    storedPreview: latest.data ?? null,
    now: new Date(),
    counts: { countSubscription24h, countUser24h, isAdmin: isAdmin(user.email) },
    limits: LIMITS,
  });

  return NextResponse.json(payload);
}

/**
 * POST /api/preview { subscriptionId }
 * Génération réelle : un dry-run du moteur sur les VRAIES sources de la
 * veille, payé par la clé de l'hébergeur (comme l'onboarding), bornée par
 * `canGenerate` (quotas quotidiens) ET `checkSpendAllowed` (plafonds hebdo).
 * L'édition produite est stockée dans `previews` : les futurs changements de
 * design la re-rendent sans rappeler le modèle.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const subscriptionId = body?.subscriptionId;
  if (!subscriptionId || typeof subscriptionId !== "string") {
    return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
  }

  const { user, sub } = await loadOwnedSubscription(subscriptionId);
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!sub) return NextResponse.json({ error: "Digest not found" }, { status: 404 });

  // Une seule génération à la fois par compte : voir `lib/preview/inflight.ts`.
  if (!tryAcquire(user.id)) {
    return NextResponse.json(
      { error: "A preview is already being generated for your account. It takes about a minute." },
      { status: 429 }
    );
  }
  try {
    return await generate(subscriptionId, user, sub);
  } finally {
    release(user.id);
  }
}

/** Corps de la génération, appelé sous verrou par `POST`. */
async function generate(
  subscriptionId: string,
  user: { id: string; email?: string | null },
  sub: PreviewSubscription
) {
  const admin = isAdmin(user.email);
  const counts = await recentGenerationCounts(subscriptionId, user.id);

  const generateVerdict = canGenerate({ ...counts, isAdmin: admin }, LIMITS);
  if (!generateVerdict.allowed) {
    return NextResponse.json({ error: generateVerdict.reason }, { status: 429 });
  }

  // Plafonds de dépense HEBDOMADAIRES sur la clé de l'hébergeur : cette
  // génération tourne sur ANTHROPIC_API_KEY, pas sur la clé BYOK de
  // l'utilisateur, exactement comme la conversation d'onboarding.
  const supabase = createClient();
  const spendVerdict = await checkSpendAllowed(supabase);
  if (!spendVerdict.allowed) {
    return NextResponse.json({ error: spendVerdict.reason }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Preview generation isn't configured on this instance yet (missing model API key)." },
      { status: 503 }
    );
  }

  const design = resolveDesignForSubscription(sub);
  const outcome = await runSubscription(subscriptionId, new Date(), {
    dryRun: true,
    credentials: { provider: "anthropic", apiKey },
    designOverride: design,
  });

  if (outcome.status === "skipped") {
    return NextResponse.json(
      { error: outcome.reason || "Nothing fresh to generate from your sources right now. Try again later." },
      { status: 422 }
    );
  }
  if (outcome.status === "error" || !outcome.preview) {
    return NextResponse.json({ error: outcome.reason || "Generation failed." }, { status: 502 });
  }

  const inputTokens = outcome.inputTokens ?? 0;
  const outputTokens = outcome.outputTokens ?? 0;
  const cost = costUsd(inputTokens, outputTokens).toFixed(4);

  const db = createAdminClient();
  const { data: inserted, error: insertError } = await db
    .from("previews")
    .insert({
      subscription_id: subscriptionId,
      user_id: user.id,
      edition: outcome.preview.edition,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
    })
    .select("edition, created_at, sent_count")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: "Generated, but could not be saved. Please try again." },
      { status: 500 }
    );
  }

  // Même journal que la conversation d'onboarding (`kind: "chat"`), pour que
  // les deux comptent dans le même plafond hebdomadaire de l'hébergeur.
  await db.from("usage_log").insert({
    user_id: user.id,
    kind: "preview",
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: cost,
  });

  const payload = buildPreviewPayload({
    sub,
    storedPreview: inserted,
    now: new Date(),
    counts: {
      countSubscription24h: counts.countSubscription24h + 1,
      countUser24h: counts.countUser24h + 1,
      isAdmin: admin,
    },
    limits: LIMITS,
  });

  return NextResponse.json(payload);
}
