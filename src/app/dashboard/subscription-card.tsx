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
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-white">
            {subscription.channel === "slack" ? "💬" : "📧"} {subscription.name}
            <span
              className={
                paused
                  ? "ml-2 rounded-full bg-amber-950 px-2 py-0.5 text-xs text-amber-400"
                  : "ml-2 rounded-full bg-emerald-950 px-2 py-0.5 text-xs text-emerald-400"
              }
            >
              {paused ? "En pause" : "Active"}
            </span>
          </p>
          <p className="mt-1 text-sm text-slate-400">
            → {subscription.destination} · cron <code>{subscription.frequency_cron}</code> ·{" "}
            {subscription.sources?.length ?? 0} source(s)
          </p>
          {lastDeliveries.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Derniers envois :{" "}
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
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 disabled:opacity-40"
          >
            {paused ? "▶ Reprendre" : "⏸ Pause"}
          </button>
          <button
            onClick={() => act("delete")}
            disabled={busy}
            className="rounded-lg border border-red-900 px-3 py-1.5 text-xs text-red-400 hover:border-red-700 disabled:opacity-40"
          >
            Supprimer
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
