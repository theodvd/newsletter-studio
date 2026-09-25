import { describe, expect, it } from "vitest";
import { canGenerate, generationsLeftToday } from "./limits";

const LIMITS = { previewDailyPerSubscription: 1, previewDailyPerUser: 3 };

describe("canGenerate", () => {
  it("autorise quand aucun compteur n'est atteint", () => {
    expect(canGenerate({ countSubscription24h: 0, countUser24h: 0, isAdmin: false }, LIMITS)).toEqual({
      allowed: true,
    });
  });

  it("refuse quand la veille a atteint son plafond quotidien", () => {
    const verdict = canGenerate({ countSubscription24h: 1, countUser24h: 0, isAdmin: false }, LIMITS);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toMatch(/this digest/i);
  });

  it("refuse quand l'utilisateur a atteint son plafond quotidien tous digests confondus", () => {
    const verdict = canGenerate({ countSubscription24h: 0, countUser24h: 3, isAdmin: false }, LIMITS);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toMatch(/across all your digests/i);
  });

  it("la borne par veille est vérifiée avant la borne par utilisateur", () => {
    const verdict = canGenerate({ countSubscription24h: 1, countUser24h: 3, isAdmin: false }, LIMITS);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toMatch(/this digest/i);
  });

  it("un admin contourne les deux compteurs quotidiens", () => {
    expect(canGenerate({ countSubscription24h: 99, countUser24h: 99, isAdmin: true }, LIMITS)).toEqual({
      allowed: true,
    });
  });

  it("message singulier quand le plafond par veille vaut 1", () => {
    const verdict = canGenerate({ countSubscription24h: 1, countUser24h: 0, isAdmin: false }, LIMITS);
    if (!verdict.allowed) expect(verdict.reason).not.toMatch(/\(1 generations\/day\)/);
  });

  it("message avec le nombre quand le plafond par veille vaut plus de 1", () => {
    const verdict = canGenerate(
      { countSubscription24h: 2, countUser24h: 0, isAdmin: false },
      { previewDailyPerSubscription: 2, previewDailyPerUser: 3 }
    );
    if (!verdict.allowed) expect(verdict.reason).toMatch(/2 generations\/day/);
  });
});

describe("generationsLeftToday", () => {
  it("part du plafond le plus bas entre veille et utilisateur", () => {
    expect(generationsLeftToday({ countSubscription24h: 0, countUser24h: 2, isAdmin: false }, LIMITS)).toBe(1);
    expect(generationsLeftToday({ countSubscription24h: 1, countUser24h: 0, isAdmin: false }, LIMITS)).toBe(0);
  });

  it("ne descend jamais sous zéro", () => {
    expect(generationsLeftToday({ countSubscription24h: 5, countUser24h: 5, isAdmin: false }, LIMITS)).toBe(0);
  });

  it("reste un repère honnête même pour un admin (canGenerate gère le contournement)", () => {
    expect(generationsLeftToday({ countSubscription24h: 1, countUser24h: 0, isAdmin: true }, LIMITS)).toBe(0);
  });
});
