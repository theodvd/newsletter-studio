"use client";

import { useState } from "react";
import { ConsentCard } from "@/components/consent-card";
import { HistoryPanel } from "@/app/dashboard/history-panel";

/**
 * Harnais de QA visuelle pour la carte de consentement d'onboarding et le
 * bloc « Conversation history » du dashboard, HORS PRODUCTION uniquement :
 * aucun réseau, aucune session Supabase. `HistoryPanel` reçoit un faux
 * `fetch` qui simule `POST /api/settings/history` sans jamais toucher la
 * base (même principe que `DevPreviewHarness`).
 */
export function DevConsentHarness() {
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(keep: boolean) {
    setBusy(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setBusy(false);
    setAnswered(keep);
  }

  const fakeFetcher: typeof fetch = async (_input, init) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (init?.method === "POST") {
      let keep = true;
      try {
        keep = JSON.parse(String(init.body ?? "{}")).keep;
      } catch {
        // ignore
      }
      return new Response(JSON.stringify({ ok: true, keepHistory: keep }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ keepHistory: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center gap-10 p-6">
      <div className="aurora-blob aurora-a" aria-hidden />
      <div className="aurora-blob aurora-b" aria-hidden />

      <section className="w-full max-w-xl">
        <h2 className="mb-3 font-display text-xs uppercase tracking-widest text-slate-500">
          Onboarding consent card
        </h2>
        {answered === null ? (
          <ConsentCard onKeep={() => handle(true)} onDecline={() => handle(false)} busy={busy} />
        ) : (
          <p className="text-sm text-slate-400">
            Answered: {answered ? "Keep my history" : "Don't store anything"}{" "}
            <button className="ml-2 underline hover:text-slate-200" onClick={() => setAnswered(null)}>
              reset
            </button>
          </p>
        )}
      </section>

      <section className="w-full max-w-xl">
        <h2 className="mb-3 font-display text-xs uppercase tracking-widest text-slate-500">
          Dashboard history block (state: Not set)
        </h2>
        <HistoryPanel initialKeepHistory={null} fetcher={fakeFetcher} />
      </section>

      <section className="w-full max-w-xl">
        <h2 className="mb-3 font-display text-xs uppercase tracking-widest text-slate-500">
          Dashboard history block (state: On)
        </h2>
        <HistoryPanel initialKeepHistory={true} fetcher={fakeFetcher} />
      </section>
    </main>
  );
}
