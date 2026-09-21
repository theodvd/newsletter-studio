/**
 * Envoi d'une édition, par email (Brevo) ou Slack.
 *
 * Règle de sécurité reprise de l'app : le destinataire email n'est JAMAIS lu
 * depuis `subscriptions.destination`, mais résolu depuis le compte. La colonne
 * est verrouillée côté base, mais le moteur ne doit pas dépendre de ce seul
 * verrou : c'est ici que l'envoi part réellement.
 */

import type { RenderContext } from "./render";
import { renderEmailHtml, renderSlackBlocks } from "./render";

export type SendResult = { ok: true } | { ok: false; error: string };

const TIMEOUT_MS = 30000;

/** Envoi par email via Brevo. Le destinataire vient du compte, pas de la veille. */
export async function sendEmail(ctx: RenderContext, accountEmail: string): Promise<SendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, error: "BREVO_API_KEY manquante côté serveur." };
  if (!accountEmail) return { ok: false, error: "Aucune adresse email sur le compte." };

  const sender = {
    name: process.env.BREVO_SENDER_NAME || "Lia Veille",
    email: process.env.BREVO_SENDER_EMAIL || "",
  };
  if (!sender.email) {
    return { ok: false, error: "BREVO_SENDER_EMAIL manquante (doit être un expéditeur validé dans Brevo)." };
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", "api-key": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        sender,
        to: [{ email: accountEmail }],
        subject: ctx.subject,
        htmlContent: renderEmailHtml(ctx),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Brevo ${res.status} : ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Brevo : ${e instanceof Error ? e.message : "erreur réseau"}` };
  }
}

/**
 * Envoi Slack. Deux chemins historiques :
 *  - une URL de webhook entrant obtenue par OAuth (cas normal)
 *  - un identifiant de canal, avec le token bot partagé (ancien mode)
 * L'hôte du webhook est vérifié : `destination` ne doit pas pouvoir devenir
 * une URL arbitraire, ce serait une SSRF déclenchée par l'utilisateur.
 */
export async function sendSlack(ctx: RenderContext, destination: string | null): Promise<SendResult> {
  const dest = String(destination || "");
  if (!dest) return { ok: false, error: "Aucune destination Slack configurée." };

  const payload = renderSlackBlocks(ctx);

  if (dest.startsWith("https://hooks.slack.com/")) {
    try {
      const res = await fetch(dest, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `Slack ${res.status} : ${body.slice(0, 120)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Slack : ${e instanceof Error ? e.message : "erreur réseau"}` };
    }
  }

  if (/^https?:\/\//i.test(dest)) {
    return { ok: false, error: "Destination Slack refusée : seules les URLs hooks.slack.com sont acceptées." };
  }

  // Ancien mode : identifiant de canal + token bot partagé.
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { ok: false, error: "SLACK_BOT_TOKEN manquant côté serveur." };
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({ channel: dest, unfurl_links: false, ...payload }),
    });
    const data = await res.json().catch(() => null);
    // Slack répond 200 même en cas d'échec : c'est `ok` qui fait foi.
    if (!data?.ok) return { ok: false, error: `Slack : ${data?.error || "erreur inconnue"}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Slack : ${e instanceof Error ? e.message : "erreur réseau"}` };
  }
}
