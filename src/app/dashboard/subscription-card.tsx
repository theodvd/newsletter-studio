"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Carte d'une veille : statut, infos, historique des 3 derniers envois,
 * actions pause/reprendre/supprimer (synchronisées avec n8n).
 */

type Delivery = { id: string; sent_at: string; status: string };

type Subscription = {
  id: string;
  name: string;
  channel: string;
  destination: string;
  frequency_cron: string;
  status: string;
  n8n_workflow_id: string | null;
  sources: { id: string }[];
  deliveries: Delivery[];
};

export function SubscriptionCard({ subscription }: { subscription: Subscription }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const paused = subscription.status === "paused";

  async function act(action: "pause" | "resume" | "delete") {
    if (busy) return;
    if (action === "delete" && !confirm(`Supprimer la veille « ${subscription.name} » et son workflow n8n ?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const lastDeliveries = [...(subscription.deliveries || [])]
    .sort((a, b) => +new Date(b.sent_at) - +new Date(a.sent_at))
    .slice(0, 3);

  return (
    <div className="glass glass-hover rounded-3xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="font-display truncate text-lg font-semibold tracking-tight text-white">
              {subscription.channel === "slack" ? "💬" : "📧"} {subscription.name}
            </p>
            <span
              className={
                paused
                  ? "rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300"
                  : "rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300"
              }
            >
              {paused ? "En pause" : "● Active"}
            </span>
          </div>
          <p className="mt-2 truncate text-sm text-slate-400">
            → {subscription.destination} ·{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-ice">
              {subscription.frequency_cron}
            </code>{" "}
            · {subscription.sources?.length ?? 0} source{(subscription.sources?.length ?? 0) > 1 ? "s" : ""}
          </p>
          {lastDeliveries.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Derniers envois ·{" "}
              {lastDeliveries
                .map(
                  (d) =>
                    `${new Date(d.sent_at).toLocaleDateString("fr-FR")} ${d.status === "success" ? "✅" : "❌"}`
                )
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => act(paused ? "resume" : "pause")}
            disabled={busy}
            className="rounded-xl border border-white/10 px-3.5 py-2 text-xs text-slate-300 transition-colors hover:border-accent/40 hover:text-white disabled:opacity-40"
          >
            {paused ? "▶ Reprendre" : "⏸ Pause"}
          </button>
          <button
            onClick={() => act("delete")}
            disabled={busy}
            className="rounded-xl border border-red-500/20 px-3.5 py-2 text-xs text-red-400/80 transition-colors hover:border-red-500/50 hover:text-red-300 disabled:opacity-40"
          >
            Supprimer
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
