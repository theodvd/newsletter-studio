"use client";

/**
 * Carte de consentement pour la conservation de l'historique de conversation
 * avec Lia (voir `profiles.keep_history`, `0009_history.sql`). Non-bloquante :
 * purement présentationnelle (callbacks fournis par l'appelant), pour rester
 * testable hors-ligne dans le harnais `/dev/consent`.
 */

export type ConsentCardProps = {
  onKeep: () => void;
  onDecline: () => void;
  busy?: boolean;
};

export function ConsentCard({ onKeep, onDecline, busy }: ConsentCardProps) {
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-display text-sm font-semibold text-white">Keep this conversation?</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Save your chat with Lia so you can pick up where you left off when you edit this digest.
          You can change this anytime from your dashboard.
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={onDecline}
          disabled={busy}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:text-white disabled:opacity-50"
        >
          Don&apos;t store anything
        </button>
        <button
          onClick={onKeep}
          disabled={busy}
          className="rounded-lg bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-3 py-1.5 text-xs font-semibold text-slate-950 transition-opacity disabled:opacity-50"
        >
          Keep my history
        </button>
      </div>
    </div>
  );
}
