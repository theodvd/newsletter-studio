import { describe, expect, it } from "vitest";
import { anthropicMaxTokens, extractAnthropicText, readAnthropicStream } from "./llm";

describe("extractAnthropicText", () => {
  // Avec Opus 5.5 (réflexion toujours active), le premier bloc est un bloc
  // `thinking` vide : l'ancien code lisait content[0].text et voyait une
  // réponse vide.
  it("ignore les blocs de réflexion et assemble les blocs de texte", () => {
    const data = {
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: '{"subject":' },
        { type: "text", text: '"ok"}' },
      ],
    };
    expect(extractAnthropicText(data)).toBe('{"subject":"ok"}');
  });

  it("un refus du modèle est une erreur explicite, pas une réponse vide", () => {
    const data = { stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] };
    expect(() => extractAnthropicText(data)).toThrow(/refusé.*cyber/);
  });

  it("une réponse tronquée par max_tokens est une erreur", () => {
    const data = { stop_reason: "max_tokens", usage: { output_tokens: 3000 }, content: [{ type: "text", text: "{" }] };
    expect(() => extractAnthropicText(data)).toThrow(/tronquée/);
  });

  it("sans bloc de texte, erreur", () => {
    expect(() => extractAnthropicText({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "" }] })).toThrow(
      /vide/
    );
  });
});

describe("anthropicMaxTokens", () => {
  it("ajoute une marge de réflexion aux modèles qui raisonnent par défaut", () => {
    expect(anthropicMaxTokens("claude-opus-5-5", 5000)).toBeGreaterThan(5000);
    expect(anthropicMaxTokens("claude-fable-5-1", 5000)).toBeGreaterThan(5000);
  });

  it("ajoute la marge dès qu'un effort est demandé", () => {
    expect(anthropicMaxTokens("claude-sonnet-4-6", 5000, "high")).toBeGreaterThan(5000);
  });

  it("ne change rien pour un modèle sans réflexion par défaut ni effort", () => {
    expect(anthropicMaxTokens("claude-sonnet-4-6", 5000)).toBe(5000);
  });
});

/** Flux SSE découpé en morceaux arbitraires, comme le réseau les livre. */
function sse(text: string, chunkSize = 7): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  });
}

const ev = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe("readAnthropicStream", () => {
  it("reconstitue texte, raison d'arrêt et usage, blocs de réflexion compris", async () => {
    const body =
      ev("message_start", { type: "message_start", message: { usage: { input_tokens: 11332, output_tokens: 1 } } }) +
      ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }) +
      ev("content_block_stop", { type: "content_block_stop", index: 0 }) +
      ev("ping", { type: "ping" }) +
      ev("content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }) +
      ev("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: '{"subject":' } }) +
      ev("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: '"Créé"}' } }) +
      ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 18877 } }) +
      ev("message_stop", { type: "message_stop" });

    const msg = await readAnthropicStream(sse(body));

    expect(extractAnthropicText(msg)).toBe('{"subject":"Créé"}');
    expect(msg.usage).toEqual({ input_tokens: 11332, output_tokens: 18877 });
    expect(msg.stop_reason).toBe("end_turn");
  });

  it("un événement error interrompt la lecture", async () => {
    const body =
      ev("message_start", { type: "message_start", message: { usage: { input_tokens: 10 } } }) +
      ev("error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
    await expect(readAnthropicStream(sse(body))).rejects.toThrow(/Overloaded/);
  });

  it("un refus arrivé en fin de flux est détecté", async () => {
    const body =
      ev("message_start", { type: "message_start", message: { usage: { input_tokens: 10 } } }) +
      ev("message_delta", { type: "message_delta", delta: { stop_reason: "refusal", stop_details: { category: "bio" } }, usage: { output_tokens: 3 } });
    const msg = await readAnthropicStream(sse(body));
    expect(() => extractAnthropicText(msg)).toThrow(/refusé.*bio/);
  });
});
