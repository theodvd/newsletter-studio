/**
 * Template classic : exactement la structure et le rendu d'origine du moteur
 * (avant les templates), pour que les veilles existantes ne changent pas.
 *
 * Porté depuis `engine/prompt.ts` (spec + validation) et `engine/render.ts`
 * (rendu email + Slack). Le modèle continue de produire un champ
 * `why_it_matters` (le prompt ne change pas), converti en `takeaway` au
 * moment de la validation : c'est le nom interne commun aux deux templates.
 */

import { JSON_ONLY_REMINDER, URLS_ONLY_RULE, languageRule } from "./rules";
import type { Edition, EditionItem, RenderContext, SlackPayload, SpecContext, Template } from "./types";

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Les URLs viennent du modèle : on n'accepte que http(s) dans un href. */
function safeHref(url: unknown): string {
  const s = String(url ?? "").trim();
  return /^https?:\/\//i.test(s) ? esc(s) : "#";
}

function outputSpec(ctx: SpecContext): string {
  const itemCount = ctx.channel === "slack" ? "3 a 5" : "5 a 8";
  return (
    "## Format de sortie\n" +
    "Tu reponds avec un JSON valide, exactement cette structure :\n" +
    "{\n" +
    '  "subject": "Titre court de l edition (avec la thematique, pas de date)",\n' +
    '  "intro": "1-2 phrases d accroche personnalisees pour le destinataire",\n' +
    '  "items": [\n' +
    "    {\n" +
    '      "tag": "categorie courte en minuscules",\n' +
    '      "title": "Titre editorialise et informatif",\n' +
    '      "summary": "2-4 phrases : le fait, le contexte, les chiffres cles",\n' +
    '      "why_it_matters": "1 phrase : pourquoi c est important POUR CE destinataire, vu son metier",\n' +
    '      "url": "URL EXACTE de l article source, copiee depuis les donnees",\n' +
    '      "source": "Nom de la source"\n' +
    "    }\n" +
    "  ],\n" +
    '  "outro": "1 phrase de cloture, ou chaine vide"\n' +
    "}\n\n" +
    "## Regles strictes\n" +
    "1. items contient " + itemCount + " items, classes du plus important au moins important pour ce profil.\n" +
    "2. Chaque info n apparait qu une seule fois. Ne retiens que les sujets pertinents pour le profil.\n" +
    "3. " + URLS_ONLY_RULE + "\n" +
    "4. " + languageRule(ctx.language) + "\n" +
    "5. " + JSON_ONLY_REMINDER + "\n" +
    "6. Aucun emoji dans le contenu.\n" +
    "7. Sois dense et factuel dans summary ; l analyse personnalisee va dans why_it_matters."
  );
}

function maxOutputTokens(): number {
  // Comportement inchangé : c'était la valeur fixe de generateDigestText.
  return 3000;
}

function validate(parsed: unknown): Edition {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Réponse du modèle invalide : JSON racine attendu.");
  }
  const obj = parsed as Record<string, unknown>;

  const missing = (["subject", "intro", "items"] as const).filter((k) => !obj[k]);
  if (missing.length > 0) {
    throw new Error("Sections manquantes dans le JSON : " + missing.join(", "));
  }
  if (!Array.isArray(obj.items) || obj.items.length === 0) {
    throw new Error("items vide, rien à envoyer.");
  }

  const items: EditionItem[] = (obj.items as Array<Record<string, unknown>>).map((raw) => ({
    tag: typeof raw.tag === "string" ? raw.tag : undefined,
    title: typeof raw.title === "string" ? raw.title : "",
    summary: typeof raw.summary === "string" ? raw.summary : undefined,
    // Le modèle produit `why_it_matters` (prompt inchangé) ; en interne, les
    // deux templates partagent le même nom de champ : `takeaway`.
    takeaway: typeof raw.why_it_matters === "string" ? raw.why_it_matters : undefined,
    url: typeof raw.url === "string" ? raw.url : "",
    source: typeof raw.source === "string" ? raw.source : undefined,
  }));

  return {
    subject: String(obj.subject),
    intro: String(obj.intro),
    items,
    outro: typeof obj.outro === "string" ? obj.outro : undefined,
  };
}

/** Email HTML en tableaux et styles inline, pour survivre aux clients mail. */
function renderEmail(ctx: RenderContext): string {
  let cards = "";
  for (const item of ctx.edition.items || []) {
    cards +=
      '<tr><td style="padding:0 0 24px 0;">' +
      '<div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6366f1;font-weight:bold;">' +
      esc(item.tag || "news") + (item.source ? " · " + esc(item.source) : "") + "</div>" +
      '<a href="' + safeHref(item.url) +
      '" style="font-size:18px;color:#111827;font-weight:bold;text-decoration:none;display:block;margin:6px 0;">' +
      esc(item.title) + "</a>" +
      '<div style="font-size:14px;color:#374151;line-height:1.6;">' + esc(item.summary) + "</div>" +
      (item.takeaway
        ? '<div style="font-size:13px;color:#6b7280;font-style:italic;margin-top:6px;">&rarr; ' +
          esc(item.takeaway) + "</div>"
        : "") +
      "</td></tr>";
  }

  return (
    '<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;padding:32px;font-family:Arial,Helvetica,sans-serif;">' +
    '<tr><td style="padding-bottom:8px;"><div style="font-size:12px;color:#6b7280;">' +
    esc(ctx.dateLabel) + " · " + esc(ctx.subscriptionName) + "</div>" +
    '<h1 style="font-size:24px;color:#111827;margin:8px 0;">' + esc(ctx.edition.subject) + "</h1>" +
    '<p style="font-size:15px;color:#374151;line-height:1.6;">' + esc(ctx.edition.intro) + "</p>" +
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;"></td></tr>' +
    cards +
    (ctx.edition.outro
      ? '<tr><td style="font-size:13px;color:#6b7280;padding-top:8px;">' + esc(ctx.edition.outro) + "</td></tr>"
      : "") +
    '<tr><td style="padding-top:24px;font-size:11px;color:#9ca3af;">Veille générée par Lia · Newsletter Studio</td></tr>' +
    "</table></td></tr></table></body></html>"
  );
}

/** Message Slack en Block Kit. */
function renderSlack(ctx: RenderContext): SlackPayload {
  const blocks: unknown[] = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: String(ctx.edition.subject || "Ta veille").substring(0, 145), emoji: true },
  });
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: ctx.dateLabel + " · " + (ctx.subscriptionName || "Veille") }],
  });
  if (ctx.edition.intro) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: ctx.edition.intro } });
  }
  blocks.push({ type: "divider" });

  for (const item of (ctx.edition.items || []).slice(0, 8)) {
    const title = String(item.title || "").replace(/[<>&]/g, "");
    let txt = "*<" + safeHref(item.url).replace(/&amp;/g, "&") + "|" + title + ">*";
    if (item.tag) txt += "  `" + item.tag + "`";
    txt += "\n" + (item.summary || "");
    if (item.takeaway) txt += "\n_" + item.takeaway + "_";
    if (item.source) txt += "  ·  " + item.source;
    blocks.push({ type: "section", text: { type: "mrkdwn", text: txt.substring(0, 2900) } });
  }

  if (ctx.edition.outro) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: ctx.edition.outro }] });
  }

  return { text: ctx.edition.subject, blocks };
}

export const classicTemplate: Template = {
  id: "classic",
  outputSpec,
  maxOutputTokens,
  validate,
  renderEmail,
  renderSlack,
};
