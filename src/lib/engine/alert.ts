/**
 * Alerte de l'opérateur quand une édition échoue.
 *
 * Sans elle, une édition ratée n'apparaît que dans l'historique de la veille :
 * c'est exactement ce qui a laissé Growfin perdre ses éditions du jeudi
 * pendant dix semaines sans que personne ne le voie. Une alerte par échec
 * suffit : le tick ne relance pas une occurrence en échec (voir
 * `lastAttempts`), il n'y a donc pas de rafale à craindre.
 */

import { sendEmail } from "./send";

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Destinataire : ENGINE_ALERT_EMAIL, sinon l'adresse des alertes d'abus. Vide = pas d'alerte. */
function alertRecipient(): string {
  return process.env.ENGINE_ALERT_EMAIL || process.env.ABUSE_ALERT_EMAIL || "";
}

/** Prévient l'opérateur. Ne lève jamais : l'alerte ne doit pas masquer l'échec qu'elle signale. */
export async function alertFailure(params: { subscriptionId: string; name: string; reason: string }): Promise<void> {
  const to = alertRecipient();
  if (!to) return;

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;">` +
    `<p style="font-size:15px;">L'édition de la veille <strong>${escapeHtml(params.name)}</strong> n'est pas partie.</p>` +
    `<p style="font-size:14px;color:#374151;"><strong>Raison :</strong> ${escapeHtml(params.reason)}</p>` +
    `<p style="font-size:12px;color:#9ca3af;">Veille ${escapeHtml(params.subscriptionId)}. ` +
    `Le moteur ne relance pas automatiquement cette occurrence : la suivante partira à l'heure prévue.</p>` +
    `</div>`;

  try {
    const sent = await sendEmail({ subject: `Édition non envoyée : ${params.name}`, html }, to);
    if (!sent.ok) console.error("[engine] alerte d'échec non envoyée :", sent.error);
  } catch (e) {
    console.error("[engine] alerte d'échec non envoyée :", e instanceof Error ? e.message : e);
  }
}
