import { describe, expect, it } from "vitest";
import { capConversationHistory, filterVisibleMessages, MAX_HISTORY_MESSAGES } from "./history";

describe("filterVisibleMessages", () => {
  it("garde les messages user/assistant en texte", () => {
    expect(
      filterVisibleMessages([
        { role: "user", content: "Bonjour" },
        { role: "assistant", content: "Salut !" },
      ])
    ).toEqual([
      { role: "user", content: "Bonjour" },
      { role: "assistant", content: "Salut !" },
    ]);
  });

  it("écarte tout rôle autre que user/assistant", () => {
    expect(filterVisibleMessages([{ role: "system", content: "instructions" }])).toEqual([]);
    expect(filterVisibleMessages([{ role: "tool", content: "resultat" }])).toEqual([]);
  });

  it("écarte un contenu qui n'est pas une chaîne (tool_use, tool_result, blocs internes)", () => {
    expect(
      filterVisibleMessages([
        { role: "assistant", content: [{ type: "tool_use", id: "1", name: "save_subscription_config", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "1", content: "{}" }] },
      ])
    ).toEqual([]);
  });

  it("écarte un contenu texte vide ou uniquement fait d'espaces", () => {
    expect(filterVisibleMessages([{ role: "assistant", content: "   " }])).toEqual([]);
    expect(filterVisibleMessages([{ role: "user", content: "" }])).toEqual([]);
  });

  it("conserve l'ordre d'origine", () => {
    const out = filterVisibleMessages([
      { role: "user", content: "1" },
      { role: "assistant", content: "2" },
      { role: "user", content: "3" },
    ]);
    expect(out.map((m) => m.content)).toEqual(["1", "2", "3"]);
  });
});

describe("capConversationHistory", () => {
  it("laisse une conversation plus courte que la borne inchangée", () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({ role: "user", content: String(i) }));
    expect(capConversationHistory(messages, 40)).toEqual(messages);
  });

  it("ne garde que les N derniers messages", () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({ role: "user", content: String(i) }));
    const capped = capConversationHistory(messages, 40);
    expect(capped).toHaveLength(40);
    expect(capped[0]).toEqual({ role: "user", content: "10" });
    expect(capped[capped.length - 1]).toEqual({ role: "user", content: "49" });
  });

  it("utilise MAX_HISTORY_MESSAGES (40) par défaut", () => {
    const messages = Array.from({ length: 45 }, (_, i) => ({ role: "user", content: String(i) }));
    expect(capConversationHistory(messages)).toHaveLength(MAX_HISTORY_MESSAGES);
  });

  it("une conversation exactement à la borne n'est pas coupée", () => {
    const messages = Array.from({ length: 40 }, (_, i) => ({ role: "user", content: String(i) }));
    expect(capConversationHistory(messages, 40)).toHaveLength(40);
  });

  it("un tableau vide ou non-tableau ne fait pas planter la fonction", () => {
    expect(capConversationHistory([], 40)).toEqual([]);
  });
});
