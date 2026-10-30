import { describe, expect, it, vi } from "vitest";
import { canUseWebGL } from "./webgl";

/** Faux canvas dont `getContext` renvoie ce qu'on lui donne (ou lève). */
function fakeCanvas(getContext: (kind: string) => unknown) {
  return () => ({ getContext }) as unknown as HTMLCanvasElement;
}

describe("canUseWebGL", () => {
  it("renvoie true quand le navigateur fournit un contexte WebGL2, et le libère", () => {
    const loseContext = vi.fn();
    const gl = { getExtension: () => ({ loseContext }) };
    expect(canUseWebGL(fakeCanvas((kind) => (kind === "webgl2" ? gl : null)))).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it("renvoie false sans contexte WebGL2 (GPU coupé, navigateur sans fenêtre)", () => {
    // Cas de prod du 30/10/2026 : getContext renvoie null, three.js plantait la page
    expect(canUseWebGL(fakeCanvas(() => null))).toBe(false);
  });

  it("renvoie false quand seul WebGL1 est disponible (non supporté par three.js r163+)", () => {
    const gl = { getExtension: () => null };
    expect(canUseWebGL(fakeCanvas((kind) => (kind === "webgl" ? gl : null)))).toBe(false);
  });

  it("renvoie false quand getContext lève une exception", () => {
    expect(
      canUseWebGL(
        fakeCanvas(() => {
          throw new Error("Error creating WebGL context.");
        })
      )
    ).toBe(false);
  });

  it("renvoie false côté serveur, sans document", () => {
    expect(typeof document).toBe("undefined");
    expect(canUseWebGL()).toBe(false);
  });
});
