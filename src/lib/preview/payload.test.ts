import { describe, expect, it } from "vitest";
import { buildPreviewPayload } from "./payload";
import { classicFixtureEdition } from "@/lib/templates/fixtures";
import type { Edition } from "@/lib/templates/types";

const WEEKLY_CRON = "0 7 * * 1";
const LIMITS = { previewDailyPerSubscription: 1, previewDailyPerUser: 3, previewSendsPerPreview: 3 };
const NO_COUNTS = { countSubscription24h: 0, countUser24h: 0, isAdmin: false };

const editorialSub = {
  name: "Veille Fintech",
  language: "en",
  frequency_cron: WEEKLY_CRON,
  status: "draft" as const,
  design: { template: "editorial" as const },
};

const classicSub = {
  name: "Veille Fintech",
  language: "fr",
  frequency_cron: WEEKLY_CRON,
  status: "active" as const,
  design: { template: "classic" as const },
};

describe("buildPreviewPayload", () => {
  it("sans édition stockée : aperçu d'exemple (editorial), instantané et jamais envoyable", () => {
    const payload = buildPreviewPayload({
      sub: editorialSub,
      storedPreview: null,
      now: new Date("2026-09-25T08:00:00Z"),
      counts: NO_COUNTS,
      limits: LIMITS,
    });
    expect(payload.source).toBe("sample");
    expect(payload.canSend).toBe(false);
    expect(payload.createdAt).toBeUndefined();
    expect(payload.html).toContain("<!DOCTYPE html>");
    expect(payload.generationsLeftToday).toBe(1);
  });

  it("sans édition stockée, template classic : utilise la fixture classic, pas sampleEdition", () => {
    const payload = buildPreviewPayload({
      sub: classicSub,
      storedPreview: null,
      now: new Date("2026-09-25T08:00:00Z"),
      counts: NO_COUNTS,
      limits: LIMITS,
    });
    expect(payload.subject).toBe(classicFixtureEdition.subject);
  });

  it("avec une édition stockée : source generated, createdAt renseigné", () => {
    const edition: Edition = { subject: "Mon sujet", intro: "Intro", items: [] };
    const payload = buildPreviewPayload({
      sub: classicSub,
      storedPreview: { edition, created_at: "2026-09-24T10:00:00Z", sent_count: 0 },
      now: new Date("2026-09-25T08:00:00Z"),
      counts: NO_COUNTS,
      limits: LIMITS,
    });
    expect(payload.source).toBe("generated");
    expect(payload.subject).toBe("Mon sujet");
    expect(payload.createdAt).toBe("2026-09-24T10:00:00Z");
  });

  it("canSend passe à false une fois le plafond d'envois de test atteint", () => {
    const edition: Edition = { subject: "Mon sujet", intro: "Intro", items: [] };
    const payload = buildPreviewPayload({
      sub: classicSub,
      storedPreview: { edition, created_at: "2026-09-24T10:00:00Z", sent_count: 3 },
      now: new Date("2026-09-25T08:00:00Z"),
      counts: NO_COUNTS,
      limits: LIMITS,
    });
    expect(payload.canSend).toBe(false);
  });

  it("canSend reste vrai sous le plafond d'envois de test", () => {
    const edition: Edition = { subject: "Mon sujet", intro: "Intro", items: [] };
    const payload = buildPreviewPayload({
      sub: classicSub,
      storedPreview: { edition, created_at: "2026-09-24T10:00:00Z", sent_count: 2 },
      now: new Date("2026-09-25T08:00:00Z"),
      counts: NO_COUNTS,
      limits: LIMITS,
    });
    expect(payload.canSend).toBe(true);
  });

  it("generationsLeftToday reflète les compteurs des dernières 24h", () => {
    const payload = buildPreviewPayload({
      sub: editorialSub,
      storedPreview: null,
      now: new Date("2026-09-25T08:00:00Z"),
      counts: { countSubscription24h: 1, countUser24h: 0, isAdmin: false },
      limits: LIMITS,
    });
    expect(payload.generationsLeftToday).toBe(0);
  });
});
