/**
 * Enregistrement et alerte des conversations signalées.
 *
 * Deux règles de conception :
 *  - on n'enregistre QUE les conversations signalées (voir migration 0006) ;
 *  - on alerte au plus une fois par heure et par personne, sinon la boîte mail
 *    se remplit au premier curieux et l'alerte cesse d'être lue.
 */

import { createAdminClient } from "@/lib/supabase/server";
import type { AbuseVerdict } from "./detect";

/** Fenêtre d'anti-répétition des alertes, par utilisateur. */
const ALERT_COOLDOWN_MINUTES = 60;

/** Durée de conservation d'une conversation signalée. */
export const RETENTION_DAYS = 30;

type ReportInput = {
  userId: string;
  email: string;
  verdict: AbuseVerdict;
  messages: Array<{ role: string; content: unknown }>;
};

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendAlert(input: ReportInput, id: number | null): Promise<void> {
  const to = process.env.ABUSE_ALERT_EMAIL;
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!to || !apiKey || !sender) return; // alerte non configurée : on se tait

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const lignes = input.verdict.signals
    .map(
      (s) =>
        `<li style="margin-bottom:8px;"><strong>${escapeHtml(s.category)}</strong><br>` +
        `<code style="background:#f3f4f6;padding:2px 4px;font-size:13px;">${escapeHtml(s.evidence)}</code></li>`
    )
    .join("");

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;">` +
    `<p style="font-size:15px;">Une conversation d'onboarding a été signalée.</p>` +
    `<p style="font-size:14px;color:#374151;">` +
    `<strong>Compte :</strong> ${escapeHtml(input.email)}<br>` +
    `<strong>Score :</strong> ${input.verdict.score}<br>` +
    `<strong>Nature :</strong> ${escapeHtml(input.verdict.summary)}</p>` +
    `<p style="font-size:14px;"><strong>Ce qui a déclenché :</strong></p>` +
    `<ul style="font-size:14px;color:#374151;">${lignes}</ul>` +
    (appUrl
      ? `<p style="font-size:14px;"><a href="${appUrl}/admin/flags">Lire la conversation complète</a></p>`
      : "") +
    `<p style="font-size:12px;color:#9ca3af;">Conversation conservée ${RETENTION_DAYS} jours` +
    (id ? ` (référence ${id})` : "") +
    `. Les conversations non signalées ne sont jamais enregistrées.</p>` +
    `</div>`;

  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "api-key": apiKey },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        sender: { name: process.env.BREVO_SENDER_NAME || "Newsletter Studio", email: sender },
        to: [{ email: to }],
        subject: `Conversation signalée : ${input.verdict.summary}`,
        htmlContent: html,
      }),
    });
  } catch (e) {
    console.error("[abuse] alerte non envoyée :", e instanceof Error ? e.message : e);
  }
}

/**
 * Enregistre la conversation signalée et alerte si nécessaire.
 * Ne lève jamais : un problème de surveillance ne doit pas casser l'onboarding
 * d'un utilisateur légitime.
 */
export async function reportAbuse(input: ReportInput): Promise<void> {
  try {
    const db = createAdminClient();

    // Anti-répétition : une alerte au plus par heure et par personne.
    const since = new Date(Date.now() - ALERT_COOLDOWN_MINUTES * 60000).toISOString();
    const { count } = await db
      .from("flagged_conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .gte("created_at", since);
    const dejaAlerte = (count ?? 0) > 0;

    const { data } = await db
      .from("flagged_conversations")
      .insert({
        user_id: input.userId,
        email: input.email,
        score: input.verdict.score,
        summary: input.verdict.summary,
        signals: input.verdict.signals,
        messages: input.messages,
      })
      .select("id")
      .single();

    console.warn(
      `[abuse] conversation signalée : ${input.email} (score ${input.verdict.score}, ${input.verdict.summary})`
    );

    if (!dejaAlerte) await sendAlert(input, data?.id ?? null);
  } catch (e) {
    console.error("[abuse] signalement impossible :", e instanceof Error ? e.message : e);
  }
}

/** Purge des conversations signalées au-delà de la durée de conservation. */
export async function purgeOldFlags(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
  const { data, error } = await createAdminClient()
    .from("flagged_conversations")
    .delete()
    .lt("created_at", cutoff)
    .select("id");
  if (error) {
    console.error("[abuse] purge impossible :", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
