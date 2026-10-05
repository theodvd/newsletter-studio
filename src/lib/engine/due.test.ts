import { describe, expect, it } from "vitest";
import { isDue } from "./due";

// Cadence de Growfin : lundi et jeudi à 7h, heure de Paris.
const GROWFIN_CRON = "0 7 * * 1,4";

describe("isDue : cadence lundi + jeudi (Growfin)", () => {
  // Le bug qui a fait passer Growfin en hebdo pendant dix semaines dans n8n :
  // le garde-fou confondait jeudi (4) et vendredi (5). Ici, le jeudi doit partir.
  it("le jeudi à 7h02 (heure d'été), l'édition est due", () => {
    const now = new Date("2026-10-08T05:02:00Z"); // jeudi 8 octobre, 7h02 à Paris
    const { due, occurrence } = isDue({ cron: GROWFIN_CRON, now, lastSentAt: null });
    expect(due).toBe(true);
    expect(occurrence?.toISOString()).toBe("2026-10-08T05:00:00.000Z");
  });

  it("le lundi à 7h02, l'édition est due", () => {
    const now = new Date("2026-10-12T05:02:00Z");
    expect(isDue({ cron: GROWFIN_CRON, now, lastSentAt: null }).due).toBe(true);
  });

  it("ni le mercredi ni le vendredi à 7h02", () => {
    for (const iso of ["2026-10-07T05:02:00Z", "2026-10-09T05:02:00Z"]) {
      expect(isDue({ cron: GROWFIN_CRON, now: new Date(iso), lastSentAt: null }).due).toBe(false);
    }
  });

  it("pas deux fois : une édition déjà partie depuis l'occurrence bloque le tick suivant", () => {
    const now = new Date("2026-10-08T05:07:00Z");
    const lastSentAt = new Date("2026-10-08T05:03:00Z");
    expect(isDue({ cron: GROWFIN_CRON, now, lastSentAt }).due).toBe(false);
  });

  // Passage à l'heure d'hiver le dimanche 25 octobre 2026 : 7h à Paris devient 6h UTC.
  it("après le passage à l'heure d'hiver, le lundi part à 7h de Paris, pas à 6h", () => {
    const tooEarly = new Date("2026-10-26T05:02:00Z"); // 6h02 à Paris
    expect(isDue({ cron: GROWFIN_CRON, now: tooEarly, lastSentAt: null }).due).toBe(false);

    const onTime = new Date("2026-10-26T06:02:00Z"); // 7h02 à Paris
    const { due, occurrence } = isDue({ cron: GROWFIN_CRON, now: onTime, lastSentAt: null });
    expect(due).toBe(true);
    expect(occurrence?.toISOString()).toBe("2026-10-26T06:00:00.000Z");
  });
});
