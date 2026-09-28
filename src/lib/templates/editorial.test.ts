import { describe, expect, it } from "vitest";
import { editorialTemplate, expectedOutputTokensForSections } from "./editorial";
import type { Design, SpecContext } from "./types";

function design(sections: Design["sections"]): Design {
  return { template: "editorial", accent: "#064E3B", title: null, sections, images: true };
}

function ctx(sections: Design["sections"], channel: SpecContext["channel"] = "email"): SpecContext {
  return { design: design(sections), channel, language: "fr" };
}

const FULL_SECTIONS: Design["sections"] = ["radar", "deep_dive", "signal", "number", "pick"];

function validJson() {
  return {
    subject: "Stripe muscle sa trésorerie",
    preheader: "Et deux autres sujets de la semaine.",
    intro: "Une intro de plusieurs phrases, qui annonce le radar.",
    radar: [
      { tag: "fintech", title: "Sujet 1", summary: "Résumé 1", takeaway: "Ce que ça change", url: "https://example.com/1", source: "Source 1" },
      { tag: "ia", title: "Sujet 2", summary: "Résumé 2", takeaway: "Ce que ça change", url: "https://example.com/2", source: "Source 2" },
      { tag: "regulation", title: "Sujet 3", summary: "Résumé 3", takeaway: "Ce que ça change", url: "https://example.com/3", source: "Source 3" },
    ],
    deep_dive: {
      tag: "fintech",
      title: "Sujet approfondi",
      url: "https://example.com/deep",
      source: "Source",
      parts: [{ heading: "Partie 1", body: "Contenu 1" }, { heading: "Partie 2", body: "Contenu 2" }],
      in_short: "En clair, voici ce qu'il faut retenir.",
    },
    signal: [
      { tag: "tech", title: "Signal 1", summary: "Résumé", url: "https://example.com/s1", source: "Source" },
      { tag: "tech", title: "Signal 2", summary: "Résumé", url: "https://example.com/s2", source: "Source" },
    ],
    number: { value: "450", label: "Un label", context: "Un contexte", url: "https://example.com/number", source: "Source" },
    pick: { title: "Un rapport", kind: "rapport", why: "Pourquoi ça vaut le coup", url: "https://example.com/pick", source: "Source" },
    outro: "Bonne semaine.",
  };
}

describe("editorialTemplate.validate", () => {
  it("accepte un JSON valide avec toutes les sections actives", () => {
    const edition = editorialTemplate.validate(validJson(), ctx(FULL_SECTIONS));
    expect(edition.subject).toBe("Stripe muscle sa trésorerie");
    expect(edition.radar).toHaveLength(3);
    expect(edition.deep_dive?.parts).toHaveLength(2);
    expect(edition.signal).toHaveLength(2);
    expect(edition.number?.value).toBe("450");
    expect(edition.pick?.title).toBe("Un rapport");
  });

  it("lève une erreur explicite quand une section active manque", () => {
    const json = validJson();
    // @ts-expect-error test volontaire d'un JSON incomplet
    delete json.deep_dive;
    expect(() => editorialTemplate.validate(json, ctx(FULL_SECTIONS))).toThrow(/Sections manquantes.*deep_dive/);
  });

  it("n'exige que les sections actives (radar/signal/number pour une cadence multi-run)", () => {
    const json = validJson();
    // @ts-expect-error non requis ici
    delete json.deep_dive;
    // @ts-expect-error non requis ici
    delete json.pick;
    const edition = editorialTemplate.validate(json, ctx(["radar", "signal", "number"]));
    expect(edition.deep_dive).toBeUndefined();
    expect(edition.pick).toBeUndefined();
    expect(edition.radar).toHaveLength(3);
  });

  it("sur Slack, n'exige ni deep_dive ni pick même si le design les liste", () => {
    const json = validJson();
    // @ts-expect-error non requis sur slack
    delete json.deep_dive;
    // @ts-expect-error non requis sur slack
    delete json.pick;
    const edition = editorialTemplate.validate(json, ctx(FULL_SECTIONS, "slack"));
    expect(edition.deep_dive).toBeUndefined();
    expect(edition.pick).toBeUndefined();
    expect(edition.radar).toHaveLength(3);
    expect(edition.signal).toHaveLength(2);
  });

  it("écarte les items radar sans URL http(s), et exige qu'il en reste au moins un", () => {
    const json = validJson();
    json.radar[0].url = "javascript:alert(1)";
    const edition = editorialTemplate.validate(json, ctx(FULL_SECTIONS));
    expect(edition.radar).toHaveLength(2);
  });

  it("plafonne radar à 3 et signal à 5", () => {
    const json = validJson();
    json.radar.push({ tag: "x", title: "Extra", summary: "s", takeaway: "t", url: "https://example.com/extra", source: "s" });
    json.signal = Array.from({ length: 7 }, (_, i) => ({
      tag: "tech", title: `Signal ${i}`, summary: "s", url: `https://example.com/sig${i}`, source: "s",
    }));
    const edition = editorialTemplate.validate(json, ctx(FULL_SECTIONS));
    expect(edition.radar).toHaveLength(3);
    expect(edition.signal).toHaveLength(5);
  });

  it("remplace tout tiret cadratin par une virgule, y compris dans les sous-objets", () => {
    // Construit par code point : ce fichier ne doit pas contenir le caractère littéral.
    const emDash = String.fromCharCode(0x2014);
    const json = validJson();
    json.intro = `Ceci est un test ${emDash} avec un tiret cadratin ${emDash} dans le texte.`;
    json.number.context = `450 contre 200 l'an dernier ${emDash} une hausse nette.`;
    const edition = editorialTemplate.validate(json, ctx(FULL_SECTIONS));
    expect(edition.intro).not.toContain(emDash);
    expect(edition.intro).toBe("Ceci est un test, avec un tiret cadratin, dans le texte.");
    expect(edition.number?.context).not.toContain(emDash);
  });

  it("lève une erreur explicite si la racine n'est pas un objet", () => {
    expect(() => editorialTemplate.validate("pas du json", ctx(FULL_SECTIONS))).toThrow();
    expect(() => editorialTemplate.validate(null, ctx(FULL_SECTIONS))).toThrow();
  });
});

describe("editorialTemplate.validate : un article cité une seule fois", () => {
  it("retire du Signal une brève qui reprend l'article du Chiffre (cas réel du 24/09)", () => {
    const json = validJson();
    json.signal[0].url = "https://www.example.com/number?utm_source=x";
    const edition = editorialTemplate.validate(json, ctx(FULL_SECTIONS));
    expect(edition.signal).toHaveLength(1);
    expect(edition.signal?.[0].title).toBe("Signal 2");
  });

  it("supprime la section Signal si toutes ses brèves sont des doublons", () => {
    const json = validJson();
    json.signal = [{ tag: "tech", title: "Doublon", summary: "s", url: "https://example.com/1", source: "s" }];
    const edition = editorialTemplate.validate(json, ctx(FULL_SECTIONS));
    expect(edition.signal).toBeUndefined();
  });
});

describe("editorialTemplate.maxOutputTokens", () => {
  it("borne le plafond entre 4000 et 12000, avec une marge de 1,8 sur l'attendu", () => {
    expect(editorialTemplate.maxOutputTokens(ctx(["radar"]))).toBeGreaterThanOrEqual(4000);
    expect(editorialTemplate.maxOutputTokens(ctx(FULL_SECTIONS))).toBeLessThanOrEqual(12000);
    // attendu : base 900 + radar 1500 + deep_dive 1500 + signal 1000 + number 250 + pick 300 = 5450
    expect(expectedOutputTokensForSections(FULL_SECTIONS)).toBe(5450);
    expect(editorialTemplate.maxOutputTokens(ctx(FULL_SECTIONS))).toBe(Math.round(5450 * 1.8));
  });

  it("laisse assez de marge à une édition quotidienne (tronquée à 2800 le 24/09)", () => {
    const daily = editorialTemplate.maxOutputTokens(ctx(["radar", "signal", "number"]));
    expect(daily).toBeGreaterThan(2800 * 2);
  });

  it("sur Slack, ne compte pas deep_dive ni pick", () => {
    const withAll = editorialTemplate.maxOutputTokens(ctx(FULL_SECTIONS, "email"));
    const onSlack = editorialTemplate.maxOutputTokens(ctx(FULL_SECTIONS, "slack"));
    expect(onSlack).toBeLessThan(withAll);
  });
});

describe("editorialTemplate.renderEmail", () => {
  it("retire le tiret cadratin du titre d'en-tête, qui vient du nom de la veille", () => {
    const emDash = String.fromCharCode(0x2014);
    const edition = editorialTemplate.validate(validJson(), ctx(FULL_SECTIONS));
    const html = editorialTemplate.renderEmail({
      edition,
      design: design(FULL_SECTIONS),
      subscriptionName: `TEST ${emDash} Veille fintech quotidienne`,
      dateLabel: "Jeudi 24 septembre 2026",
      language: "fr",
    });
    expect(html).not.toContain(emDash);
    expect(html).toContain("TEST, Veille fintech quotidienne");
  });
});
