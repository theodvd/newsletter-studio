import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classicFixtureEdition } from "@/lib/templates/fixtures";
import type { SubscriptionConfig } from "./types";

// Tout ce qui touche au réseau ou à la base est simulé : on teste ici le
// câblage de `runSubscription` (garde-fou de liste, envoi, mémoire, alerte),
// pas Brevo ni Supabase.
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "sk-ant-test-key-0000000000" }));
vi.mock("@/lib/tools/safe-fetch", () => ({ safeFetchText: vi.fn() }));
vi.mock("./config", () => ({
  loadConfig: vi.fn(),
  loadHistory: vi.fn(async () => []),
  logDelivery: vi.fn(async () => {}),
}));
vi.mock("./alert", () => ({ alertFailure: vi.fn(async () => {}) }));
vi.mock("./images", () => ({ enrichImages: vi.fn(async () => {}) }));
vi.mock("./llm", () => ({ generateDigestText: vi.fn() }));
vi.mock("./send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./send")>()),
  sendEmail: vi.fn(async () => ({ ok: true })),
  sendSlack: vi.fn(async () => ({ ok: true })),
  sendBrevoCampaign: vi.fn(async () => ({ ok: true })),
}));

import { safeFetchText } from "@/lib/tools/safe-fetch";
import { alertFailure } from "./alert";
import { loadConfig, logDelivery } from "./config";
import { generateDigestText } from "./llm";
import { runSubscription } from "./run";
import { sendBrevoCampaign, sendEmail } from "./send";

const NOW = new Date("2026-10-08T05:02:00Z");

function growfinConfig(overrides: Partial<SubscriptionConfig> = {}): SubscriptionConfig {
  return {
    id: "sub-growfin",
    user_id: "user-theo",
    name: "Growfin",
    profile_prompt: "Lecteurs fintech et IA.",
    frequency_cron: "0 7 * * 1,4",
    channel: "email",
    destination: null,
    tone: null,
    language: "fr",
    status: "active",
    design: { template: "classic", title: "Growfin" },
    model: "claude-opus-5-5",
    effort: "high",
    brevo_list_id: 7,
    sources: [
      { id: "s1", url: "https://example.com/feed.xml", feed_url: null, title: "Exemple", type: "rss", validation_status: "valid" },
    ],
    delivered_items: [],
    profiles: { email: "theo@example.com", full_name: null, job_role: null, llm_provider: "anthropic", llm_key_encrypted: "chiffre" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(safeFetchText).mockResolvedValue({
    ok: true,
    text:
      `<?xml version="1.0"?><rss version="2.0"><channel><title>Exemple</title>` +
      `<item><title>Un article frais</title><link>https://example.com/a</link>` +
      `<pubDate>${NOW.toUTCString()}</pubDate><description>Résumé.</description></item>` +
      `</channel></rss>`,
  } as Awaited<ReturnType<typeof safeFetchText>>);
  vi.mocked(generateDigestText).mockResolvedValue({
    text: JSON.stringify({
      subject: classicFixtureEdition.subject,
      intro: classicFixtureEdition.intro,
      items: classicFixtureEdition.items,
      memory_update: "anecdote Kasparov",
    }),
    inputTokens: 1000,
    outputTokens: 800,
    model: "claude-opus-5-5",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("runSubscription : envoi à une liste", () => {
  it("refuse un compte hors liste blanche AVANT d'appeler le modèle, et alerte", async () => {
    vi.stubEnv("ENGINE_LIST_SEND_USER_IDS", "quelqu-un-d-autre");
    vi.mocked(loadConfig).mockResolvedValue(growfinConfig());

    const outcome = await runSubscription("sub-growfin", NOW);

    expect(outcome.status).toBe("error");
    expect(outcome.reason).toMatch(/ENGINE_LIST_SEND_USER_IDS/);
    expect(generateDigestText).not.toHaveBeenCalled();
    expect(sendBrevoCampaign).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(alertFailure).toHaveBeenCalledOnce();
    expect(logDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
  });

  it("compte autorisé : campagne Brevo avec désinscription, mémoire stockée", async () => {
    vi.stubEnv("ENGINE_LIST_SEND_USER_IDS", "user-theo");
    vi.mocked(loadConfig).mockResolvedValue(growfinConfig());

    const outcome = await runSubscription("sub-growfin", NOW);

    expect(outcome.status).toBe("success");
    expect(generateDigestText).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-opus-5-5", effort: "high" }),
      expect.any(String),
      expect.any(String),
      expect.any(Object)
    );
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendBrevoCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ listId: 7, senderName: "Growfin", html: expect.stringContaining("{{ unsubscribe }}") })
    );
    expect(logDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "success", memory: "anecdote Kasparov" }));
    expect(alertFailure).not.toHaveBeenCalled();
  });

  it("un échec d'envoi alerte l'opérateur et ne stocke pas d'édition réussie", async () => {
    vi.stubEnv("ENGINE_LIST_SEND_USER_IDS", "user-theo");
    vi.mocked(loadConfig).mockResolvedValue(growfinConfig());
    vi.mocked(sendBrevoCampaign).mockResolvedValueOnce({ ok: false, error: "Brevo 400" });

    const outcome = await runSubscription("sub-growfin", NOW);

    expect(outcome.status).toBe("error");
    expect(alertFailure).toHaveBeenCalledWith(expect.objectContaining({ name: "Growfin", reason: "Brevo 400" }));
    expect(logDelivery).not.toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
  });
});

describe("runSubscription : édition manquée sur une liste", () => {
  it("sans clé, une veille à liste échoue et alerte (au lieu d'être sautée en silence)", async () => {
    vi.stubEnv("ENGINE_LIST_SEND_USER_IDS", "user-theo");
    vi.mocked(loadConfig).mockResolvedValue(
      growfinConfig({ profiles: { email: "theo@example.com", full_name: null, job_role: null, llm_provider: null, llm_key_encrypted: null } })
    );

    const outcome = await runSubscription("sub-growfin", NOW);

    expect(outcome.status).toBe("error");
    expect(alertFailure).toHaveBeenCalledOnce();
    expect(logDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
  });

  it("une veille personnelle sans clé reste simplement sautée, sans alerte", async () => {
    vi.mocked(loadConfig).mockResolvedValue(
      growfinConfig({
        brevo_list_id: null,
        profiles: { email: "theo@example.com", full_name: null, job_role: null, llm_provider: null, llm_key_encrypted: null },
      })
    );

    const outcome = await runSubscription("sub-growfin", NOW);

    expect(outcome.status).toBe("skipped");
    expect(alertFailure).not.toHaveBeenCalled();
    expect(logDelivery).not.toHaveBeenCalled();
  });
});

describe("runSubscription : veille personnelle (sans liste)", () => {
  it("part toujours à l'adresse du compte, sans campagne", async () => {
    vi.mocked(loadConfig).mockResolvedValue(growfinConfig({ brevo_list_id: null, model: null, effort: null }));

    const outcome = await runSubscription("sub-growfin", NOW);

    expect(outcome.status).toBe("success");
    expect(sendEmail).toHaveBeenCalledWith(expect.any(Object), "theo@example.com");
    expect(sendBrevoCampaign).not.toHaveBeenCalled();
  });
});
