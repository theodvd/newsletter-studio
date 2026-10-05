/**
 * Envoi d'une édition, par email (Brevo) ou Slack.
 *
 * Le rendu (HTML email, Block Kit Slack) est produit en amont par le template
 * actif (`run.ts` appelle `template.renderEmail`/`renderSlack`) : cette
 * fonction ne fait plus que l'envoi du résultat déjà prêt, ce qui permet de
 * prévisualiser une édition (`dryRun`) sans dupliquer la logique de rendu.
 *
 * Règle de sécurité reprise de l'app : le destinataire email n'est JAMAIS lu
 * depuis `subscriptions.destination`, mais résolu depuis le compte. La colonne
 * est verrouillée côté base, mais le moteur ne doit pas dépendre de ce seul
 * verrou : c'est ici que l'envoi part réellement.
 */

import type { SlackPayload } from "@/lib/templates/types";

export type SendResult = { ok: true } | { ok: false; error: string };

const TIMEOUT_MS = 30000;

/** Envoi par email via Brevo. Le destinataire vient du compte, pas de la veille. */
export async function sendEmail(
  content: { subject: string; html: string },
  accountEmail: string
): Promise<SendResult> {
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
        subject: content.subject,
        htmlContent: content.html,
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
 * Un compte a-t-il le droit d'envoyer à une liste ?
 *
 * La colonne `brevo_list_id` est serveur-only, mais elle ne suffit pas : c'est
 * cette liste blanche, posée dans l'environnement du serveur, qui décide. Une
 * erreur de grant côté base ne doit jamais suffire à transformer le service
 * en outil d'envoi en masse.
 */
export function canSendToList(userId: string): boolean {
  const allowed = (process.env.ENGINE_LIST_SEND_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return allowed.includes(userId);
}

/**
 * Ajoute le lien de désinscription Brevo, obligatoire pour une campagne. Les
 * templates n'en ont pas (une veille perso part à son seul propriétaire).
 * Inséré avant `</body>` quand il existe, sinon en fin de document.
 */
export function withUnsubscribeLink(html: string, language: string): string {
  if (/\{\{\s*unsubscribe\s*\}\}/i.test(html)) return html;
  const label = language.startsWith("fr") ? "Se désabonner" : "Unsubscribe";
  const footer =
    `<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#9ca3af;text-align:center;margin:16px 0;">` +
    `<a href="{{ unsubscribe }}" style="color:#9ca3af;">${label}</a></p>`;
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i === -1 ? html + footer : html.slice(0, i) + footer + html.slice(i);
}

/**
 * Envoi à une liste Brevo : création d'une campagne, puis envoi immédiat.
 * Contrairement à l'email transactionnel, la campagne gère la désinscription
 * et les statistiques d'ouverture côté Brevo. `run.ts` vérifie `canSendToList`
 * avant d'appeler le modèle (pour ne rien dépenser) ; la vérification est
 * refaite ici, là où l'envoi part réellement, comme pour `sendEmail`.
 */
export async function sendBrevoCampaign(params: {
  ownerUserId: string;
  listId: number;
  name: string;
  subject: string;
  preheader?: string;
  html: string;
  senderName: string;
}): Promise<SendResult> {
  if (!canSendToList(params.ownerUserId)) {
    return { ok: false, error: "Envoi à une liste refusé : ce compte n'est pas dans ENGINE_LIST_SEND_USER_IDS." };
  }
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, error: "BREVO_API_KEY manquante côté serveur." };
  const senderEmail = process.env.BREVO_SENDER_EMAIL || "";
  if (!senderEmail) {
    return { ok: false, error: "BREVO_SENDER_EMAIL manquante (doit être un expéditeur validé dans Brevo)." };
  }
  const headers = { "content-type": "application/json", accept: "application/json", "api-key": apiKey };

  let campaignId: number;
  try {
    const res = await fetch("https://api.brevo.com/v3/emailCampaigns", {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        name: params.name,
        subject: params.subject,
        ...(params.preheader ? { previewText: params.preheader } : {}),
        sender: { name: params.senderName, email: senderEmail },
        type: "classic",
        htmlContent: params.html,
        recipients: { listIds: [params.listId] },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || typeof data?.id !== "number") {
      return { ok: false, error: `Brevo (création de campagne) ${res.status} : ${JSON.stringify(data).slice(0, 200)}` };
    }
    campaignId = data.id;
  } catch (e) {
    return { ok: false, error: `Brevo (création de campagne) : ${e instanceof Error ? e.message : "erreur réseau"}` };
  }

  try {
    const res = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaignId}/sendNow`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Brevo (envoi de la campagne ${campaignId}, restée en brouillon) ${res.status} : ${body.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: `Brevo (envoi de la campagne ${campaignId}, restée en brouillon) : ${e instanceof Error ? e.message : "erreur réseau"}`,
    };
  }
}

/**
 * Envoi Slack. Deux chemins historiques :
 *  - une URL de webhook entrant obtenue par OAuth (cas normal)
 *  - un identifiant de canal, avec le token bot partagé (ancien mode)
 * L'hôte du webhook est vérifié : `destination` ne doit pas pouvoir devenir
 * une URL arbitraire, ce serait une SSRF déclenchée par l'utilisateur.
 */
export async function sendSlack(payload: SlackPayload, destination: string | null): Promise<SendResult> {
  const dest = String(destination || "");
  if (!dest) return { ok: false, error: "Aucune destination Slack configurée." };

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
