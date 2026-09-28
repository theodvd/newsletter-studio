import { describe, expect, it } from "vitest";
import { release, tryAcquire } from "./inflight";

describe("verrou de génération par utilisateur", () => {
  it("refuse une seconde génération tant que la première tourne, puis la réautorise", () => {
    expect(tryAcquire("user-a")).toBe(true);
    expect(tryAcquire("user-a")).toBe(false);
    expect(tryAcquire("user-b")).toBe(true);
    release("user-a");
    expect(tryAcquire("user-a")).toBe(true);
    release("user-a");
    release("user-b");
  });
});
