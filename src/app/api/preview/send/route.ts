import { NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { LIMITS } from "@/lib/plan";
import { getTemplate } from "@/lib/templates";
import { resolveDesignForSubscription } from "@/lib/templates/design";
import { formatEditionDate } from "@/lib/templates/i18n";
import type { RenderContext } from "@/lib/templates/types";
import { sendEmail } from "@/lib/engine/send";
import type { PreviewSubscription } from "@/lib/preview/payload";

const SELECT = "id, name, frequency_cron, status, design, language";

/**
 * POST /api/preview/send { subscriptionId }
 * Envoie la dernière édition d'aperçu stockée à l'adresse du compte connecté,
 * en test. Le destinataire n'est JAMAIS lu ailleurs que sur la session
 * (même règle anti-relais que `sendEmail` dans le moteur) : ni le corps de la
 * requête, ni la colonne `subscriptions.destination`, ne sont une source de
 * confiance pour un email.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const subscriptionId = body?.subscriptionId;
  if (!subscriptionId || typeof subscriptionId !== "string") {
    return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const accountEmail = user.email;
  if (!accountEmail) return NextResponse.json({ error: "No email address on this account." }, { status: 400 });

  // Propriété vérifiée via le client à session (RLS).
  const { data: subRaw } = await supabase.from("subscriptions").select(SELECT).eq("id", subscriptionId).maybeSingle();
  const sub = subRaw as PreviewSubscription | null;
  if (!sub) return NextResponse.json({ error: "Digest not found" }, { status: 404 });

  const db = createAdminClient();
  const { data: preview } = await db
    .from("previews")
    .select("id, edition, sent_count")
    .eq("subscription_id", subscriptionId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!preview) {
    return NextResponse.json({ error: "Generate a preview first." }, { status: 404 });
  }
  if (preview.sent_count >= LIMITS.previewSendsPerPreview) {
    return NextResponse.json(
      {
        error: `You've reached the test-send limit for this edition (${LIMITS.previewSendsPerPreview}). Generate a new one to send it again.`,
      },
      { status: 429 }
    );
  }

  const design = resolveDesignForSubscription(sub);
  const template = getTemplate(design.template);
  const language = sub.language || "fr";
  const renderCtx: RenderContext = {
    edition: preview.edition,
    design,
    subscriptionName: sub.name,
    dateLabel: formatEditionDate(new Date(), language),
    language,
  };
  const html = template.renderEmail(renderCtx);
  const subject = "[Preview] " + (preview.edition?.subject || sub.name);

  const sent = await sendEmail({ subject, html }, accountEmail);
  if (!sent.ok) {
    return NextResponse.json({ error: sent.error }, { status: 502 });
  }

  const { error: updateError } = await db
    .from("previews")
    .update({ sent_count: preview.sent_count + 1, last_sent_at: new Date().toISOString() })
    .eq("id", preview.id)
    .eq("subscription_id", subscriptionId)
    .eq("user_id", user.id);
  if (updateError) {
    // L'email est déjà parti : ne pas transformer ça en échec côté utilisateur.
    console.error("[preview/send] incrément sent_count impossible :", updateError.message);
  }

  return NextResponse.json({ ok: true, sentTo: accountEmail });
}
