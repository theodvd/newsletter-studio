import { describe, expect, it } from "vitest";
import golden from "./__fixtures__/classic.golden.json";
import { classicTemplate } from "./classic";
import { classicFixtureContext, classicFixtureEdition } from "./fixtures";
import type { Design, RenderContext } from "./types";

/**
 * Non-régression : le template classic doit produire un rendu BYTE-IDENTIQUE
 * à celui d'avant le refactor (capturé dans `__fixtures__/classic.golden.json`,
 * généré à partir de l'ancien `engine/render.ts` sur cette même fixture).
 * Si ce test casse, c'est que le rendu classic a changé : les veilles
 * existantes ne doivent JAMAIS voir leur digest se transformer sous elles.
 */
describe("classicTemplate (parité pré-refactor)", () => {
  const design: Design = { template: "classic", accent: "#064E3B", title: null, sections: [], images: true };
  const ctx: RenderContext = {
    edition: classicFixtureEdition,
    design,
    subscriptionName: classicFixtureContext.subscriptionName,
    dateLabel: classicFixtureContext.dateLabel,
    language: classicFixtureContext.language,
  };

  it("renderEmail est byte-identique au golden pré-refactor", () => {
    expect(classicTemplate.renderEmail(ctx)).toBe(golden.html);
  });

  it("renderSlack est identique au golden pré-refactor", () => {
    expect(classicTemplate.renderSlack(ctx)).toEqual(golden.slack);
  });
});
