import { describe, expect, it, vi } from "vitest";
import { enrichImages, extractOgImage } from "./images";
import type { Article } from "./types";
import type { Design, Edition } from "@/lib/templates/types";

vi.mock("@/lib/tools/safe-fetch", () => ({
  safeFetchText: vi.fn(),
}));

describe("extractOgImage", () => {
  it("extrait og:image (attribut content après property)", () => {
    const html = `<head><meta property="og:image" content="https://cdn.example.com/img.jpg"></head>`;
    expect(extractOgImage(html, "https://example.com/article")).toBe("https://cdn.example.com/img.jpg");
  });

  it("extrait og:image même quand content précède property", () => {
    const html = `<head><meta content="https://cdn.example.com/img2.jpg" property="og:image"></head>`;
    expect(extractOgImage(html, "https://example.com/article")).toBe("https://cdn.example.com/img2.jpg");
  });

  it("retombe sur twitter:image si og:image absent", () => {
    const html = `<head><meta name="twitter:image" content="https://cdn.example.com/tw.jpg"></head>`;
    expect(extractOgImage(html, "https://example.com/article")).toBe("https://cdn.example.com/tw.jpg");
  });

  it("résout une URL relative par rapport à la page", () => {
    const html = `<head><meta property="og:image" content="/images/cover.jpg"></head>`;
    expect(extractOgImage(html, "https://example.com/blog/article")).toBe("https://example.com/images/cover.jpg");
  });

  it("rejette une image en http (non-https)", () => {
    const html = `<head><meta property="og:image" content="http://cdn.example.com/img.jpg"></head>`;
    expect(extractOgImage(html, "https://example.com/article")).toBeNull();
  });

  it("renvoie null si aucune balise meta pertinente", () => {
    const html = `<head><title>Sans image</title></head>`;
    expect(extractOgImage(html, "https://example.com/article")).toBeNull();
  });
});

function article(overrides: Partial<Article> = {}): Article {
  return {
    title: "Titre",
    url: "https://example.com/a",
    url_norm: "https://example.com/a",
    title_key: null,
    summary: "résumé",
    source: "Source",
    pubDate: "",
    dateConfidence: "undated",
    image_url: null,
    ...overrides,
  };
}

function baseDesign(overrides: Partial<Design> = {}): Design {
  return { template: "editorial", accent: "#064E3B", title: null, sections: ["radar"], images: true, ...overrides };
}

describe("enrichImages", () => {
  it("ne fait rien pour le template classic", async () => {
    const edition: Edition = { subject: "s", intro: "i", radar: [{ title: "A", url: "https://example.com/a" }] };
    await enrichImages(edition, [article({ image_url: "https://cdn.example.com/x.jpg" })], baseDesign({ template: "classic" }));
    expect(edition.radar?.[0].image_url).toBeUndefined();
  });

  it("ne fait rien si design.images est faux", async () => {
    const edition: Edition = { subject: "s", intro: "i", radar: [{ title: "A", url: "https://example.com/a" }] };
    await enrichImages(edition, [article({ image_url: "https://cdn.example.com/x.jpg" })], baseDesign({ images: false }));
    expect(edition.radar?.[0].image_url).toBeUndefined();
  });

  it("reprend l'image déjà extraite du flux (pas de fetch)", async () => {
    const { safeFetchText } = await import("@/lib/tools/safe-fetch");
    const edition: Edition = { subject: "s", intro: "i", radar: [{ title: "A", url: "https://example.com/a" }] };
    await enrichImages(edition, [article({ image_url: "https://cdn.example.com/x.jpg" })], baseDesign());
    expect(edition.radar?.[0].image_url).toBe("https://cdn.example.com/x.jpg");
    expect(safeFetchText).not.toHaveBeenCalled();
  });

  it("ne fetch jamais une URL que le modèle aurait inventée (absente des articles)", async () => {
    const { safeFetchText } = await import("@/lib/tools/safe-fetch");
    const edition: Edition = { subject: "s", intro: "i", radar: [{ title: "A", url: "https://example.com/invented" }] };
    await enrichImages(edition, [article({ url: "https://example.com/a", url_norm: "https://example.com/a" })], baseDesign());
    expect(safeFetchText).not.toHaveBeenCalled();
    expect(edition.radar?.[0].image_url).toBeUndefined();
  });

  it("va chercher og:image sur la page de l'article s'il n'a pas d'image de flux", async () => {
    const { safeFetchText } = await import("@/lib/tools/safe-fetch");
    vi.mocked(safeFetchText).mockResolvedValue({
      ok: true,
      text: `<head><meta property="og:image" content="https://cdn.example.com/fetched.jpg"></head>`,
      contentType: "text/html",
    });
    const edition: Edition = { subject: "s", intro: "i", radar: [{ title: "A", url: "https://example.com/a" }] };
    await enrichImages(edition, [article()], baseDesign());
    expect(edition.radar?.[0].image_url).toBe("https://cdn.example.com/fetched.jpg");
  });

  it("ignore silencieusement un échec de fetch", async () => {
    const { safeFetchText } = await import("@/lib/tools/safe-fetch");
    vi.mocked(safeFetchText).mockRejectedValue(new Error("boom"));
    const edition: Edition = { subject: "s", intro: "i", radar: [{ title: "A", url: "https://example.com/a" }] };
    await expect(enrichImages(edition, [article()], baseDesign())).resolves.toBeUndefined();
    expect(edition.radar?.[0].image_url).toBeUndefined();
  });
});
