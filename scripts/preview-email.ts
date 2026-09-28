/**
 * Génère des aperçus statiques des templates à partir des éditions d'exemple
 * (`templates/fixtures.ts`) : aucun appel réseau, aucune clé API, aucune
 * lecture de base de données. Sert à valider visuellement le rendu (email +
 * Slack) sans dépendre d'une vraie exécution du moteur.
 *
 * Usage : npm run preview:email
 * Sortie : preview/*.html (email) et preview/*.slack.json (Block Kit).
 */

import fs from "node:fs";
import path from "node:path";
import { classicTemplate } from "../src/lib/templates/classic";
import { editorialTemplate } from "../src/lib/templates/editorial";
import { sampleEdition } from "../src/lib/templates/fixtures";
import { formatEditionDate } from "../src/lib/templates/i18n";
import type { Language } from "../src/lib/templates/i18n";
import type { Design, Edition, RenderContext, SectionId } from "../src/lib/templates/types";

const OUT_DIR = path.resolve(__dirname, "../preview");
fs.mkdirSync(OUT_DIR, { recursive: true });

// Date fixe : des aperçus reproductibles, pas de dépendance à l'horloge.
const NOW = new Date("2026-09-21T07:00:00Z");

const DAILY_SECTIONS: SectionId[] = ["radar", "signal", "number"];
const WEEKLY_SECTIONS: SectionId[] = ["radar", "deep_dive", "signal", "number", "pick"];

function write(name: string, html: string, slack: unknown): void {
  fs.writeFileSync(path.join(OUT_DIR, `${name}.html`), html, "utf8");
  fs.writeFileSync(path.join(OUT_DIR, `${name}.slack.json`), JSON.stringify(slack, null, 2), "utf8");
  console.log(`écrit : preview/${name}.html + preview/${name}.slack.json`);
}

function editorialContext(
  language: Language,
  sections: SectionId[],
  subscriptionName: string,
  edition: Edition
): RenderContext {
  const design: Design = { template: "editorial", accent: "#064E3B", title: null, sections, images: true };
  return { edition, design, subscriptionName, dateLabel: formatEditionDate(NOW, language), language };
}

// ── Editorial, anglais, cadence quotidienne (sections courtes) ─────────────
{
  const edition = sampleEdition("en", DAILY_SECTIONS);
  const ctx = editorialContext("en", DAILY_SECTIONS, "Fintech Watch", edition);
  write("editorial-en-daily", editorialTemplate.renderEmail(ctx), editorialTemplate.renderSlack(ctx));
}

// ── Editorial, anglais, cadence hebdomadaire (format long) ──────────────────
{
  const edition = sampleEdition("en", WEEKLY_SECTIONS);
  const ctx = editorialContext("en", WEEKLY_SECTIONS, "Fintech Watch", edition);
  write("editorial-en-weekly", editorialTemplate.renderEmail(ctx), editorialTemplate.renderSlack(ctx));
}

// ── Editorial, français, cadence hebdomadaire ────────────────────────────────
{
  const edition = sampleEdition("fr", WEEKLY_SECTIONS);
  const ctx = editorialContext("fr", WEEKLY_SECTIONS, "Veille Fintech", edition);
  write("editorial-fr-weekly", editorialTemplate.renderEmail(ctx), editorialTemplate.renderSlack(ctx));
}

// ── Editorial, anglais, hebdomadaire, AVEC images sur les 3 sujets du radar ──
// Source stable et publique, uniquement pour l'aperçu (jamais en test réel).
{
  const edition = sampleEdition("en", WEEKLY_SECTIONS);
  const seeds = ["fintech-payments", "central-bank", "ai-support"];
  (edition.radar || []).forEach((item, i) => {
    item.image_url = `https://picsum.photos/seed/${seeds[i] || "news"}/1104/620`;
  });
  const ctx = editorialContext("en", WEEKLY_SECTIONS, "Fintech Watch", edition);
  write("editorial-en-weekly-images", editorialTemplate.renderEmail(ctx), editorialTemplate.renderSlack(ctx));
}

// ── Classic, anglais : structure et rendu inchangés depuis avant les templates ──
{
  const design: Design = { template: "classic", accent: "#064E3B", title: null, sections: [], images: true };
  const edition: Edition = {
    subject: "Fed holds rates, OpenAI raises $6.6bn",
    intro: "A busy week between a record raise and monetary caution: here is what matters.",
    items: [
      {
        tag: "ai",
        title: "OpenAI closes a $6.6bn funding round",
        summary: "Valuation climbs to $157bn, led by Thrive Capital with notable participation from Microsoft.",
        takeaway: "For a fintech operator, this valuation resets expectations for future AI funding rounds.",
        url: "https://example.com/openai-raises-6-6bn",
        source: "TechCrunch",
      },
      {
        tag: "regulation",
        title: "The Fed holds rates, staying cautious",
        summary: "The committee cited inflation still too unstable to cut rates this quarter.",
        takeaway: "Financing conditions for fintech startups stay tight at least until the next meeting.",
        url: "https://example.com/fed-holds-rates-classic",
        source: "Reuters",
      },
    ],
    outro: "Have a good week, see you next Monday.",
  };
  const ctx: RenderContext = {
    edition,
    design,
    subscriptionName: "Fintech Watch",
    dateLabel: formatEditionDate(NOW, "en"),
    language: "en",
  };
  write("classic-en", classicTemplate.renderEmail(ctx), classicTemplate.renderSlack(ctx));
}

console.log("Terminé.");
