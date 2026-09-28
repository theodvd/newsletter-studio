import { describe, expect, it } from "vitest";
import { mergeDesignInput } from "./set-design";
import type { Design } from "@/lib/templates/types";

const WEEKLY_CRON = "0 7 * * 1"; // 1 run/semaine -> défaut editorial complet
const DAILY_CRON = "0 7 * * 1-5"; // 5 run/semaine -> défaut editorial court

const CURRENT: Design = {
  template: "editorial",
  accent: "#064E3B",
  title: null,
  sections: ["radar", "deep_dive", "signal", "number", "pick"],
  images: true,
};

describe("mergeDesignInput", () => {
  it("un input vide laisse le design actuel intact", () => {
    expect(mergeDesignInput(CURRENT, {}, WEEKLY_CRON)).toEqual(CURRENT);
  });

  it("ne change que le champ fourni, garde le reste du design actuel", () => {
    const merged = mergeDesignInput(CURRENT, { accent: "#1E3A8A" }, WEEKLY_CRON);
    expect(merged.accent).toBe("#1E3A8A");
    expect(merged.template).toBe("editorial");
    expect(merged.sections).toEqual(CURRENT.sections);
    expect(merged.images).toBe(true);
  });

  it("change le template sans toucher aux autres champs", () => {
    const merged = mergeDesignInput(CURRENT, { template: "classic" }, WEEKLY_CRON);
    expect(merged.template).toBe("classic");
    expect(merged.accent).toBe(CURRENT.accent);
  });

  it("sanitise une couleur invalide fournie par l'agent (jamais stockée telle quelle)", () => {
    const merged = mergeDesignInput(CURRENT, { accent: "bleu marine" }, WEEKLY_CRON);
    expect(merged.accent).toBe("#064E3B"); // repli sur le défaut de resolveDesign
  });

  it("title: null réinitialise explicitement (différent d'un champ omis)", () => {
    const withTitle: Design = { ...CURRENT, title: "Ma veille" };
    const merged = mergeDesignInput(withTitle, { title: null }, WEEKLY_CRON);
    expect(merged.title).toBeNull();
  });

  it("title omis garde le titre actuel", () => {
    const withTitle: Design = { ...CURRENT, title: "Ma veille" };
    const merged = mergeDesignInput(withTitle, { accent: "#1E3A8A" }, WEEKLY_CRON);
    expect(merged.title).toBe("Ma veille");
  });

  it("un titre fourni est sanitisé (trim, tronqué à 60)", () => {
    const merged = mergeDesignInput(CURRENT, { title: "  Ma veille  " }, WEEKLY_CRON);
    expect(merged.title).toBe("Ma veille");
  });

  it("remplace entièrement la liste des sections fournie, dans l'ordre donné", () => {
    const merged = mergeDesignInput(CURRENT, { sections: ["number", "radar"] }, WEEKLY_CRON);
    expect(merged.sections).toEqual(["number", "radar"]);
  });

  it("une liste de sections invalide retombe sur le défaut de la cadence, jamais sur les sections actuelles", () => {
    const merged = mergeDesignInput(CURRENT, { sections: ["bogus"] }, DAILY_CRON);
    expect(merged.sections).toEqual(["radar", "signal", "number"]);
  });

  it("images : booléen accepté, sinon ignoré via le repli de resolveDesign", () => {
    const merged = mergeDesignInput(CURRENT, { images: false }, WEEKLY_CRON);
    expect(merged.images).toBe(false);
  });

  it("un template inconnu retombe sur classic en entier (comme resolveDesign)", () => {
    const merged = mergeDesignInput(CURRENT, { template: "glam" }, WEEKLY_CRON);
    expect(merged.template).toBe("classic");
  });
});
