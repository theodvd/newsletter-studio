"use client";

import { useState } from "react";

/**
 * Bloc « Conversation history » du dashboard : état actuel (On / Off / Not
 * set), un bouton pour basculer, et « Delete my history ». Écrit via
 * `POST /api/settings/history` (voir cette route pour la sécurité :
 * `keep_history` et `conversations` sont server-only).
 *
 * `fetcher` remplace `fetch` global : sert au harnais de QA visuelle
 * hors-ligne (`/dev/consent`), comme `PreviewDialog`.
 */

type Fetcher = typeof fetch;

type Props = {
  initialKeepHistory: boolean | null;
  fetcher?: Fetcher;
};

export function HistoryPanel({ initialKeepHistory, fetcher }: Props) {
  const [keepHistory, setKeepHistory] = useState<boolean | null>(initialKeepHistory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doFetch = fetcher ?? fetch;

  async function setKeep(keep: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await doFetch("/api/settings/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update your preference.");
      setKeepHistory(keep);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update your preference.");
    } finally {
      setBusy(false);
    }
  }

  const stateLabel = keepHistory === true ? "On" : keepHistory === false ? "Off" : "Not set";

  return (
    <div className="glass mt-6 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-medium text-white">Conversation history</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {keepHistory === true
              ? "Your chats with Lia are saved so you can pick up where you left off when you edit a digest."
              : "Your chats with Lia are not saved."}{" "}
            Current state: <span className="text-slate-300">{stateLabel}</span>.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setKeep(!keepHistory)}
            disabled={busy}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-50"
          >
            {keepHistory ? "Turn off" : "Turn on"}
          </button>
          <button
            onClick={() => setKeep(false)}
            disabled={busy || keepHistory === false}
            className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-400/80 transition-colors hover:border-red-500/50 hover:text-red-300 disabled:opacity-40"
          >
            Delete my history
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
