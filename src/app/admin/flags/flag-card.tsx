"use client";

import { useState } from "react";

/**
 * Une conversation signalée : le motif d'abord, la conversation à la demande.
 * On ne déroule pas les messages par défaut : dans neuf cas sur dix, les
 * extraits qui ont déclenché suffisent à trancher.
 */

type Signal = { category: string; evidence: string; weight: number };
type Message = { role: string; content: unknown };

type Flag = {
  id: number;
  email: string | null;
  score: number;
  summary: string;
  signals: Signal[] | null;
  messages: Message[] | null;
  reviewed: boolean;
  created_at: string;
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String((part as { text: unknown }).text)
          : typeof part === "object" && part !== null && "type" in part
          ? `[${String((part as { type: unknown }).type)}]`
          : ""
      )
      .join(" ");
  }
  return JSON.stringify(content);
}

export function FlagCard({ flag }: { flag: Flag }) {
  const [open, setOpen] = useState(false);
  const [reviewed, setReviewed] = useState(flag.reviewed);
  const [busy, setBusy] = useState(false);

  async function markReviewed() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/flags/${flag.id}`, { method: "PATCH" });
      if (res.ok) setReviewed(true);
    } finally {
      setBusy(false);
    }
  }

  const messages = (flag.messages ?? []).filter((m) => m.role === "user" || m.role === "assistant");

  return (
    <div
      className={
        "glass rounded-2xl p-5 " + (reviewed ? "opacity-60" : "border border-amber-400/20")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm font-medium text-white">{flag.summary}</p>
          <p className="mt-1 text-xs text-slate-500">
            {flag.email ?? "compte supprimé"} · score {flag.score} ·{" "}
            {new Date(flag.created_at).toLocaleString("fr-FR")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200"
          >
            {open ? "Masquer" : `Conversation (${messages.length})`}
          </button>
          {!reviewed && (
            <button
              onClick={markReviewed}
              disabled={busy}
              className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              {busy ? "..." : "Marquer vu"}
            </button>
          )}
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {(flag.signals ?? []).map((s, i) => (
          <li key={i} className="text-xs">
            <span className="font-mono text-amber-400/80">{s.category}</span>
            <span className="mt-1 block rounded bg-black/30 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-slate-300">
              {s.evidence}
            </span>
          </li>
        ))}
      </ul>

      {open && (
        <div className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-xl bg-black/20 p-4">
          {messages.length === 0 && <p className="text-xs text-slate-500">Conversation vide.</p>}
          {messages.map((m, i) => (
            <div key={i}>
              <p className="text-[10px] uppercase tracking-widest text-slate-600">{m.role}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                {textOf(m.content).slice(0, 4000)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
