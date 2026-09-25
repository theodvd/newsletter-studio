import { describe, expect, it } from "vitest";
import { resolveDesign, resolveDesignForSubscription } from "./design";

const DAILY_CRON = "0 7 * * 1-5"; // 5 run/semaine
const WEEKLY_CRON = "0 7 * * 1"; // 1 run/semaine

describe("resolveDesign", () => {
  it("retombe sur classic pour une valeur absente", () => {
    expect(resolveDesign(undefined, WEEKLY_CRON)).toEqual({
      template: "classic",
      accent: "#064E3B",
      title: null,
      sections: ["radar", "deep_dive", "signal", "number", "pick"],
      images: true,
    });
    expect(resolveDesign(null, WEEKLY_CRON).template).toBe("classic");
  });

  it("retombe sur classic pour une valeur qui n'est pas un objet", () => {
    expect(resolveDesign("editorial", WEEKLY_CRON).template).toBe("classic");
    expect(resolveDesign(42, WEEKLY_CRON).template).toBe("classic");
    expect(resolveDesign(["editorial"], WEEKLY_CRON).template).toBe("classic");
  });

  it("retombe sur classic pour un template inconnu, en ignorant le reste de l'objet", () => {
    const resolved = resolveDesign({ template: "glam", accent: "#123456" }, WEEKLY_CRON);
    expect(resolved.template).toBe("classic");
    expect(resolved.accent).toBe("#064E3B");
  });

  it("accepte editorial et sanitise chaque champ indépendamment", () => {
    const resolved = resolveDesign(
      { template: "editorial", accent: "not-a-color", title: "  Ma veille  ", images: false },
      WEEKLY_CRON
    );
    expect(resolved.template).toBe("editorial");
    expect(resolved.accent).toBe("#064E3B"); // couleur invalide -> défaut
    expect(resolved.title).toBe("Ma veille");
    expect(resolved.images).toBe(false);
  });

  it("garde une couleur hexadécimale valide", () => {
    expect(resolveDesign({ template: "editorial", accent: "#AB12CD" }, WEEKLY_CRON).accent).toBe("#AB12CD");
  });

  it("choisit les sections par défaut selon la cadence", () => {
    expect(resolveDesign({ template: "editorial" }, DAILY_CRON).sections).toEqual(["radar", "signal", "number"]);
    expect(resolveDesign({ template: "editorial" }, WEEKLY_CRON).sections).toEqual([
      "radar", "deep_dive", "signal", "number", "pick",
    ]);
  });

  it("sections : ne garde que les ids connus, déduplique, conserve l'ordre donné", () => {
    const resolved = resolveDesign(
      { template: "editorial", sections: ["number", "bogus", "radar", "number", "signal"] },
      WEEKLY_CRON
    );
    expect(resolved.sections).toEqual(["number", "radar", "signal"]);
  });

  it("sections : ne tombe jamais à vide, retombe sur le défaut de la cadence", () => {
    const resolved = resolveDesign({ template: "editorial", sections: ["bogus", 42, null] }, DAILY_CRON);
    expect(resolved.sections).toEqual(["radar", "signal", "number"]);
    const notArray = resolveDesign({ template: "editorial", sections: "radar" }, DAILY_CRON);
    expect(notArray.sections).toEqual(["radar", "signal", "number"]);
  });

  it("title : trim, retire les caractères de contrôle, tronque à 60, vide -> null", () => {
    expect(resolveDesign({ template: "editorial", title: "   " }, WEEKLY_CRON).title).toBeNull();
    expect(resolveDesign({ template: "editorial", title: 42 }, WEEKLY_CRON).title).toBeNull();
    const long = "x".repeat(80);
    expect(resolveDesign({ template: "editorial", title: long }, WEEKLY_CRON).title).toHaveLength(60);
    const withControl = "Ma\u0007 veille";
    expect(resolveDesign({ template: "editorial", title: withControl }, WEEKLY_CRON).title).toBe("Ma veille");
  });

  it("images : uniquement un booléen, sinon true par défaut", () => {
    expect(resolveDesign({ template: "editorial", images: "oui" }, WEEKLY_CRON).images).toBe(true);
    expect(resolveDesign({ template: "editorial" }, WEEKLY_CRON).images).toBe(true);
    expect(resolveDesign({ template: "editorial", images: false }, WEEKLY_CRON).images).toBe(false);
  });
});

describe("resolveDesignForSubscription", () => {
  it("un brouillon sans design résout sur editorial", () => {
    const resolved = resolveDesignForSubscription({
      design: undefined,
      frequency_cron: WEEKLY_CRON,
      status: "draft",
    });
    expect(resolved.template).toBe("editorial");
    expect(resolved.sections).toEqual(["radar", "deep_dive", "signal", "number", "pick"]);
  });

  it("un brouillon avec design null résout aussi sur editorial", () => {
    expect(
      resolveDesignForSubscription({ design: null, frequency_cron: WEEKLY_CRON, status: "draft" }).template
    ).toBe("editorial");
  });

  it("une veille active sans design retombe sur classic (jamais sur editorial dans son dos)", () => {
    expect(
      resolveDesignForSubscription({ design: undefined, frequency_cron: WEEKLY_CRON, status: "active" }).template
    ).toBe("classic");
  });

  it("une veille en pause sans design retombe aussi sur classic", () => {
    expect(
      resolveDesignForSubscription({ design: undefined, frequency_cron: WEEKLY_CRON, status: "paused" }).template
    ).toBe("classic");
  });

  it("un design enregistré est respecté quel que soit le statut", () => {
    const design = { template: "editorial", accent: "#AB12CD" };
    expect(
      resolveDesignForSubscription({ design, frequency_cron: WEEKLY_CRON, status: "active" }).accent
    ).toBe("#AB12CD");
    expect(
      resolveDesignForSubscription({ design, frequency_cron: WEEKLY_CRON, status: "draft" }).accent
    ).toBe("#AB12CD");
  });
});
