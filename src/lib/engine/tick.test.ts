import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  // `lastAttempts` : aucune édition récente, toutes les veilles dues sont à lancer.
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ gte: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/abuse/report", () => ({ purgeOldFlags: vi.fn(async () => 0) }));
vi.mock("./config", () => ({
  loadActiveSubscriptions: vi.fn(async () => [{ id: "sub-growfin", frequency_cron: "0 7 * * 1,4" }]),
}));
vi.mock("./run", () => ({ runSubscription: vi.fn() }));

import { runSubscription } from "./run";
import { runTick } from "./tick";

describe("runTick : verrou anti-doublon", () => {
  it("une édition encore en cours n'est pas relancée par le tick suivant", async () => {
    let finish: () => void = () => {};
    vi.mocked(runSubscription).mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve({ subscriptionId: "sub-growfin", status: "success" })))
    );

    // Jeudi 8 octobre, 7h02 puis 7h07 à Paris : l'édition de 7h dure plus de 5 minutes.
    const first = runTick(new Date("2026-10-08T05:02:00Z"));
    await new Promise((r) => setTimeout(r, 0));
    const second = await runTick(new Date("2026-10-08T05:07:00Z"));

    expect(second.due).toBe(0);
    expect(runSubscription).toHaveBeenCalledTimes(1);

    finish();
    expect((await first).outcomes[0].status).toBe("success");

    // Une fois terminée, le verrou est levé (la delivery écrite fera foi ensuite).
    vi.mocked(runSubscription).mockResolvedValue({ subscriptionId: "sub-growfin", status: "success" });
    expect((await runTick(new Date("2026-10-08T05:12:00Z"))).due).toBe(1);
  });
});
