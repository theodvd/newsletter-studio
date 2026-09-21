/**
 * Rendu d'une édition : HTML pour l'email, Block Kit pour Slack.
 * Porté depuis les nœuds n8n « Rendu HTML email » et « Rendu Slack ».
 */

import type { Digest } from "./types";

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Les URLs viennent du modèle : on n'accepte que http(s) dans un href. */
function safeHref(url: unknown): string {
  const s = String(url ?? "").trim();
  return /^https?:\/\//i.test(s) ? esc(s) : "#";
}

export type RenderContext = {
  digest: Digest;
  subject: string;
  dateEdition: string;
  subscriptionName: string;
};

/** Email HTML en tableaux et styles inline, pour survivre aux clients mail. */
export function renderEmailHtml(ctx: RenderContext): string {
  let cards = "";
  for (const item of ctx.digest.items || []) {
    cards +=
      '<tr><td style="padding:0 0 24px 0;">' +
      '<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6366f1;font-weight:bold;">' +
      esc(item.tag || "news") + (item.source ? " · " + esc(item.source) : "") + "</div>" +
      '<a href="' + safeHref(item.url) +
      '" style="font-size:18px;color:#111827;font-weight:bold;text-decoration:none;display:block;margin:6px 0;">' +
      esc(item.title) + "</a>" +
      '<div style="font-size:14px;color:#374151;line-height:1.6;">' + esc(item.summary) + "</div>" +
      (item.why_it_matters
        ? '<div style="font-size:13px;color:#6b7280;font-style:italic;margin-top:6px;">&rarr; ' +
          esc(item.why_it_matters) + "</div>"
        : "") +
      "</td></tr>";
  }

  return (
    '<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:32px;font-family:Arial,Helvetica,sans-serif;">' +
    '<tr><td style="padding-bottom:8px;"><div style="font-size:12px;color:#6b7280;">' +
    esc(ctx.dateEdition) + " · " + esc(ctx.subscriptionName) + "</div>" +
    '<h1 style="font-size:24px;color:#111827;margin:8px 0;">' + esc(ctx.subject) + "</h1>" +
    '<p style="font-size:15px;color:#374151;line-height:1.6;">' + esc(ctx.digest.intro) + "</p>" +
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"></td></tr>' +
    cards +
    (ctx.digest.outro
      ? '<tr><td style="font-size:13px;color:#6b7280;padding-top:8px;">' + esc(ctx.digest.outro) + "</td></tr>"
      : "") +
    '<tr><td style="padding-top:24px;font-size:11px;color:#9ca3af;">Veille générée par Lia · Newsletter Studio</td></tr>' +
    "</table></td></tr></table></body></html>"
  );
}

export type SlackPayload = {
  text: string;
  blocks: unknown[];
};

/** Message Slack en Block Kit. */
export function renderSlackBlocks(ctx: RenderContext): SlackPayload {
  const blocks: unknown[] = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: String(ctx.subject || "Ta veille").substring(0, 145), emoji: true },
  });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: ctx.dateEdition + " · " + (ctx.subscriptionName || "Veille") }],
  });
  if (ctx.digest.intro) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: ctx.digest.intro } });
  }
  blocks.push({ type: "divider" });

  for (const item of (ctx.digest.items || []).slice(0, 8)) {
    const title = String(item.title || "").replace(/[<>&]/g, "");
    let txt = "*<" + safeHref(item.url).replace(/&amp;/g, "&") + "|" + title + ">*";
    if (item.tag) txt += "  `" + item.tag + "`";
    txt += "\n" + (item.summary || "");
    if (item.why_it_matters) txt += "\n_" + item.why_it_matters + "_";
    if (item.source) txt += "  ·  " + item.source;
    blocks.push({ type: "section", text: { type: "mrkdwn", text: txt.substring(0, 2900) } });
  }

  if (ctx.digest.outro) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: ctx.digest.outro }] });
  }

  return { text: ctx.subject, blocks };
}
