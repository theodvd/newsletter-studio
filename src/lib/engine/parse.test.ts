import { describe, expect, it } from "vitest";
import { parseAndFilter } from "./parse";
import type { SourceFetchTarget } from "./types";

const NOW = new Date("2026-09-21T08:00:00Z");
const PUB_DATE = NOW.toUTCString();

function feedWith(items: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Flux de test</title>${items}</channel></rss>`;
}

const TARGET: SourceFetchTarget = {
  fetchUrl: "https://example.com/feed.xml",
  sourceUrl: "https://example.com/feed.xml",
  sourceTitle: "Flux de test",
  sourceType: "rss",
};

// Cadence hebdomadaire : fenêtre de fraîcheur large, pas d'effet de bord sur ce test.
const WEEKLY_CRON = "0 7 * * 1";

describe("parseAndFilter : extraction d'image RSS", () => {
  // Un flux ne garde que les 5 premiers items (`kept >= 5`, logique de parse.ts
  // inchangée) : ce test reste volontairement à 5 items pour ne pas en perdre.
  it("extrait media:content, media:thumbnail, enclosure image, une <img>, et laisse null sinon", () => {
    const items = `
      <item>
        <title>Alpha media content</title>
        <link>https://example.com/alpha</link>
        <pubDate>${PUB_DATE}</pubDate>
        <description>Résumé alpha</description>
        <media:content url="https://cdn.example.com/alpha.jpg" medium="image" />
      </item>
      <item>
        <title>Bravo media thumbnail</title>
        <link>https://example.com/bravo</link>
        <pubDate>${PUB_DATE}</pubDate>
        <description>Résumé bravo</description>
        <media:thumbnail url="https://cdn.example.com/bravo-thumb.jpg" />
      </item>
      <item>
        <title>Charlie enclosure image</title>
        <link>https://example.com/charlie</link>
        <pubDate>${PUB_DATE}</pubDate>
        <description>Résumé charlie</description>
        <enclosure url="https://cdn.example.com/charlie.jpg" type="image/jpeg" />
      </item>
      <item>
        <title>Delta img in description</title>
        <link>https://example.com/delta</link>
        <pubDate>${PUB_DATE}</pubDate>
        <description><![CDATA[<p>Texte <img src="https://cdn.example.com/delta.jpg" /></p>]]></description>
      </item>
      <item>
        <title>Echo sans image</title>
        <link>https://example.com/echo</link>
        <pubDate>${PUB_DATE}</pubDate>
        <description>Résumé echo, sans aucune image.</description>
      </item>
    `;

    const { articles } = parseAndFilter([{ target: TARGET, body: feedWith(items) }], [], WEEKLY_CRON, NOW);
    const byTitle = new Map(articles.map((a) => [a.title, a]));

    expect(byTitle.get("Alpha media content")?.image_url).toBe("https://cdn.example.com/alpha.jpg");
    expect(byTitle.get("Bravo media thumbnail")?.image_url).toBe("https://cdn.example.com/bravo-thumb.jpg");
    expect(byTitle.get("Charlie enclosure image")?.image_url).toBe("https://cdn.example.com/charlie.jpg");
    expect(byTitle.get("Delta img in description")?.image_url).toBe("https://cdn.example.com/delta.jpg");
    expect(byTitle.get("Echo sans image")?.image_url).toBeNull();
  });

  it("rejette une image en http (non-https) : mieux vaut pas d'image qu'un contenu mixte", () => {
    const items = `
      <item>
        <title>Foxtrot image http rejetee</title>
        <link>https://example.com/foxtrot</link>
        <pubDate>${PUB_DATE}</pubDate>
        <description>Résumé foxtrot</description>
        <media:content url="http://cdn.example.com/insecure.jpg" medium="image" />
      </item>
    `;

    const { articles } = parseAndFilter([{ target: TARGET, body: feedWith(items) }], [], WEEKLY_CRON, NOW);
    expect(articles[0]?.image_url).toBeNull();
  });
});
