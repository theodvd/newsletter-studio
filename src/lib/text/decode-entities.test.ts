import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./decode-entities";

describe("decodeHtmlEntities", () => {
  it("décode les 5 entités nommées courantes", () => {
    expect(decodeHtmlEntities("React Native &amp; AI Dev Weekly")).toBe("React Native & AI Dev Weekly");
    expect(decodeHtmlEntities("a &lt; b")).toBe("a < b");
    expect(decodeHtmlEntities("a &gt; b")).toBe("a > b");
    expect(decodeHtmlEntities("dit &quot;bonjour&quot;")).toBe('dit "bonjour"');
    expect(decodeHtmlEntities("l&apos;équipe")).toBe("l'équipe");
  });

  it("décode les entités numériques décimales et hexadécimales", () => {
    expect(decodeHtmlEntities("l&#39;équipe")).toBe("l'équipe");
    expect(decodeHtmlEntities("l&#x27;équipe")).toBe("l'équipe");
    expect(decodeHtmlEntities("&#233;t&#233;")).toBe("été");
  });

  it("décode plusieurs occurrences dans la même chaîne", () => {
    expect(decodeHtmlEntities("Growth &amp; Data &amp; AI")).toBe("Growth & Data & AI");
  });

  it("ne décode qu'une seule fois (pas de double décodage récursif)", () => {
    // "&amp;lt;" doit devenir "&lt;", jamais "<"
    expect(decodeHtmlEntities("&amp;lt;")).toBe("&lt;");
  });

  it("laisse un texte sans entité inchangé", () => {
    expect(decodeHtmlEntities("Veille marchés financiers")).toBe("Veille marchés financiers");
    expect(decodeHtmlEntities("")).toBe("");
  });

  it("laisse une entité inconnue ou malformée inchangée", () => {
    expect(decodeHtmlEntities("&nbsp;&copy;")).toBe("&nbsp;&copy;");
    expect(decodeHtmlEntities("un & sans point-virgule")).toBe("un & sans point-virgule");
  });

  it("tolère une entrée non-string en la renvoyant telle quelle", () => {
    // @ts-expect-error : robustesse défensive testée volontairement hors du typage
    expect(decodeHtmlEntities(null)).toBe(null);
    // @ts-expect-error : robustesse défensive testée volontairement hors du typage
    expect(decodeHtmlEntities(undefined)).toBe(undefined);
  });
});
