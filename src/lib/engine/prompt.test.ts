import { describe, expect, it } from "vitest";
import { getTemplate, resolveDesign } from "@/lib/templates";
import { classicFixtureEdition } from "@/lib/templates/fixtures";
import type { SpecContext } from "@/lib/templates/types";
import { buildHistoryBlock, buildPrompt, MEMORY_MAX_CHARS, parseEditionWithMemory } from "./prompt";
import type { HistoryEntry, SubscriptionConfig } from "./types";

const classic = getTemplate("classic");
const specCtx: SpecContext = {
  design: resolveDesign({ template: "classic" }, "0 7 * * 1,4"),
  channel: "email",
  language: "fr",
};

const config = {
  id: "sub-1",
  user_id: "user-1",
  name: "Growfin",
  profile_prompt: "Lecteurs fintech et IA.",
  frequency_cron: "0 7 * * 1,4",
  channel: "email",
  destination: null,
  tone: null,
  language: "fr",
  status: "active",
  sources: [],
  delivered_items: [],
  profiles: null,
} as SubscriptionConfig;

const history: HistoryEntry[] = [
  {
    sentAt: "2026-10-05T05:01:00Z",
    edition: classicFixtureEdition,
    memory: "anecdote Kasparov | comparaison avec le Minitel",
  },
  { sentAt: "2026-10-01T05:01:00Z", edition: null, memory: null },
];

describe("mémoire entre éditions : prompt", () => {
  it("sans historique, aucun bloc", () => {
    expect(buildHistoryBlock([])).toBe("");
  });

  it("résume l'objet, les sujets et la mémoire de chaque édition passée", () => {
    const block = buildHistoryBlock(history);
    expect(block).toContain("2026-10-05");
    expect(block).toContain(classicFixtureEdition.subject);
    for (const item of classicFixtureEdition.items ?? []) expect(block).toContain(item.title);
    expect(block).toContain("anecdote Kasparov");
  });

  it("le prompt demande memory_update et donne l'historique au modèle", () => {
    const { system, user } = buildPrompt(config, [], new Date("2026-10-08T05:00:00Z"), classic, specCtx, history);
    expect(system).toContain('"memory_update"');
    expect(user).toContain("Editions precedentes");
    expect(user).toContain("anecdote Kasparov");
  });
});

describe("parseEditionWithMemory", () => {
  const modelJson = (extra: Record<string, unknown>) =>
    JSON.stringify({
      subject: classicFixtureEdition.subject,
      intro: classicFixtureEdition.intro,
      items: classicFixtureEdition.items,
      ...extra,
    });

  it("valide l'édition et récupère la mémoire à part", () => {
    const { edition, memory } = parseEditionWithMemory(
      modelJson({ memory_update: "  angle régulation |  anecdote Kasparov " }),
      classic,
      specCtx
    );
    expect(edition.subject).toBe(classicFixtureEdition.subject);
    expect(memory).toBe("angle régulation | anecdote Kasparov");
  });

  it("une mémoire absente ou vide donne null, sans faire échouer l'édition", () => {
    expect(parseEditionWithMemory(modelJson({}), classic, specCtx).memory).toBeNull();
    expect(parseEditionWithMemory(modelJson({ memory_update: "   " }), classic, specCtx).memory).toBeNull();
    expect(parseEditionWithMemory(modelJson({ memory_update: 42 }), classic, specCtx).memory).toBeNull();
  });

  it("une mémoire trop longue est tronquée", () => {
    const { memory } = parseEditionWithMemory(modelJson({ memory_update: "x".repeat(2000) }), classic, specCtx);
    expect(memory).toHaveLength(MEMORY_MAX_CHARS);
  });
});
