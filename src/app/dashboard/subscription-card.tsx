"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { estimateRunCostUsd, formatUsd, runsPerWeek } from "@/lib/pricing";
import { describeCron } from "@/lib/cron";
import { resolveDesignForSubscription } from "@/lib/templates/design";
import { PreviewDialog } from "@/components/preview-dialog";

/**
 * One digest card: status, schedule, last 3 deliveries,
 * pause/resume/delete actions.
 */

type Delivery = { id: string; sent_at: string; status: string };

type Subscription = {
  id: string;
  name: string;
  channel: string;
  destination: string | null;
  destination_label: string | null;
  frequency_cron: string;
  status: string;
  /** Réglages de mise en page (colonne `design`) : voir `resolveDesignForSubscription`. */
  design?: unknown;
  sources: { id: string }[];
  deliveries: Delivery[];
};

export function SubscriptionCard({ subscription }: { subscription: Subscription }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const router = useRouter();
  const paused = subscription.status === "paused";

  async function act(action: "pause" | "resume" | "delete") {
    if (busy) return;
    if (
      action === "delete" &&
      !confirm(`Delete "${subscription.name}"? This cannot be undone.`)
    ) {
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
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const destinationLabel =
    subscription.channel === "slack"
      ? subscription.destination_label || "Slack"
      : subscription.destination;

  const lastDeliveries = [...(subscription.deliveries || [])]
    .sort((a, b) => +new Date(b.sent_at) - +new Date(a.sent_at))
    .slice(0, 3);

  const weeklyCost = runsPerWeek(subscription.frequency_cron) * estimateRunCostUsd(resolveDesignForSubscription(subscription));

  return (
    <div className="glass glass-hover rounded-3xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="font-display truncate text-lg font-semibold tracking-tight text-white">
              {subscription.name}
            </p>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
              {subscription.channel === "slack" ? "Slack" : "Email"}
            </span>
            <span
              className={
                paused
                  ? "rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300"
                  : "rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300"
              }
            >
              {paused ? "Paused" : "Active"}
            </span>
          </div>
          <p className="mt-2 truncate text-sm text-slate-400" title={subscription.frequency_cron}>
            {destinationLabel} · {describeCron(subscription.frequency_cron)} ·{" "}
            {subscription.sources?.length ?? 0} source{(subscription.sources?.length ?? 0) > 1 ? "s" : ""} ·{" "}
            <span className="text-slate-300">~{formatUsd(weeklyCost)}/week</span>
          </p>
          {lastDeliveries.length > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              Recent deliveries ·{" "}
              {lastDeliveries
                .map(
                  (d) =>
                    `${new Date(d.sent_at).toLocaleDateString("en-GB")} ${d.status === "success" ? "ok" : "failed"}`
                )
                .join(" · ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setPreviewOpen(true)}
            className="rounded-xl border border-white/10 px-3.5 py-2 text-xs text-slate-300 transition-colors hover:border-accent/40 hover:text-white"
          >
            Preview
          </button>
          <Link
            href={`/onboarding?edit=${subscription.id}`}
            className="rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
          >
            Edit
          </Link>
          <button
            onClick={() => act(paused ? "resume" : "pause")}
            disabled={busy}
            className="rounded-xl border border-white/10 px-3.5 py-2 text-xs text-slate-300 transition-colors hover:border-accent/40 hover:text-white disabled:opacity-40"
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => act("delete")}
            disabled={busy}
            className="rounded-xl border border-red-500/20 px-3.5 py-2 text-xs text-red-400/80 transition-colors hover:border-red-500/50 hover:text-red-300 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <PreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        subscriptionId={subscription.id}
        subscriptionName={subscription.name}
      />
    </div>
  );
}
