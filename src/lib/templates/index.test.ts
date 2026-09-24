import { describe, expect, it } from "vitest";
import { allItems, getTemplate } from "./index";
import type { Edition } from "./types";

describe("allItems", () => {
  it("aplatit items (classic)", () => {
    const edition: Edition = {
      subject: "s",
      intro: "i",
      items: [
        { title: "A", url: "https://example.com/a" },
        { title: "B", url: "https://example.com/b" },
      ],
    };
    expect(allItems(edition)).toEqual([
      { url: "https://example.com/a", title: "A" },
      { url: "https://example.com/b", title: "B" },
    ]);
  });

  it("aplatit radar, deep_dive, signal, number et pick (editorial)", () => {
    const edition: Edition = {
      subject: "s",
      intro: "i",
      radar: [{ title: "Radar 1", url: "https://example.com/radar1" }],
      deep_dive: {
        title: "Deep",
        url: "https://example.com/deep",
        parts: [{ heading: "h", body: "b" }],
        in_short: "in short",
      },
      signal: [{ title: "Signal 1", url: "https://example.com/signal1" }],
      number: { value: "42", label: "label", context: "context", url: "https://example.com/number" },
      pick: { title: "Pick", kind: "article", why: "why", url: "https://example.com/pick" },
    };
    expect(allItems(edition)).toEqual([
      { url: "https://example.com/radar1", title: "Radar 1" },
      { url: "https://example.com/deep", title: "Deep" },
      { url: "https://example.com/signal1", title: "Signal 1" },
      { url: "https://example.com/number", title: "label" },
      { url: "https://example.com/pick", title: "Pick" },
    ]);
  });

  it("ignore un number sans url", () => {
    const edition: Edition = {
      subject: "s",
      intro: "i",
      number: { value: "42", label: "label", context: "context" },
    };
    expect(allItems(edition)).toEqual([]);
  });

  it("ignore les items dont l'url est vide", () => {
    const edition: Edition = {
      subject: "s",
      intro: "i",
      items: [{ title: "Sans URL", url: "" }],
    };
    expect(allItems(edition)).toEqual([]);
  });
});

describe("getTemplate", () => {
  it("résout classic et editorial par id", () => {
    expect(getTemplate("classic").id).toBe("classic");
    expect(getTemplate("editorial").id).toBe("editorial");
  });
});
