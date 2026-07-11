import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";
import { SubscriptionCard } from "./subscription-card";
import { PlanBanner } from "./plan-banner";
import { getUserPlan, PLAN_LIMITS } from "@/lib/plan";
import { monthlySpendUsd } from "@/lib/usage";

export const dynamic = "force-dynamic";

/**
 * Dashboard: running digests (status, schedule, channel) + recent deliveries.
 * Affiche le badge de plan, la barre d'usage mensuel, et un encart upgrade si Free.
 */
export default async function DashboardPage() {
  const supabase = createClient();

  const [{ data: subscriptions }, plan, spendUsd] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "id, name, channel, destination, destination_label, frequency_cron, status, n8n_workflow_id, created_at, sources(id), deliveries(id, sent_at, status)"
      )
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    getUserPlan(supabase),
    monthlySpendUsd(supabase),
  ]);

  const limits = PLAN_LIMITS[plan];
  const capUsd = limits.monthlyCapUsd;

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
      <Reveal className="flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-accent/70">
            Dashboard
          </p>
          <div className="mt-3 flex items-center gap-3">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-ice">
              My digests
            </h1>
            {/* Badge de plan */}
            <span
              className={
                plan === "pro"
                  ? "rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-300"
                  : "rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-400"
              }
            >
              {limits.label}
            </span>
          </div>
        </div>
        <Link
          href="/onboarding"
          className="rounded-xl bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-4 py-2.5 font-display text-sm font-semibold text-slate-950 transition-all duration-300 hover:shadow-[0_0_24px_rgba(124,198,255,0.3)]"
        >
          New digest
        </Link>
      </Reveal>

      {/* Barre d'usage mensuel */}
      <Reveal delay={0.05}>
        <UsageBar spendUsd={spendUsd} capUsd={capUsd} />
      </Reveal>

      {/* Encart upgrade (Free uniquement) */}
      {plan === "free" && (
        <Reveal delay={0.08}>
          <PlanBanner />
        </Reveal>
      )}

      {!subscriptions?.length ? (
        <Reveal delay={0.1}>
          <div className="glass mt-10 rounded-3xl p-14 text-center">
            <p className="font-display font-medium text-white">Nothing running yet</p>
            <p className="mt-2 text-sm text-slate-500">
              Start a conversation with Lia — your first digest takes about 5 minutes.
            </p>
          </div>
        </Reveal>
      ) : (
        <Stagger className="mt-10 space-y-4" gap={0.1}>
          {subscriptions.map((sub) => (
            <StaggerItem key={sub.id}>
              <SubscriptionCard subscription={sub} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </main>
  );
}

/**
 * Barre fine d'usage mensuel : dépense réelle vs plafond du plan.
 * Discrète, juste sous le titre.
 */
function UsageBar({ spendUsd, capUsd }: { spendUsd: number; capUsd: number }) {
  const pct = Math.min(100, (spendUsd / capUsd) * 100);
  const overHalf = pct > 50;
  const nearCap = pct > 80;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>Monthly usage</span>
        <span className={nearCap ? "text-amber-400" : ""}>
          ${spendUsd.toFixed(2)} / ${capUsd.toFixed(2)}
        </span>
      </div>
      <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={
            "h-full rounded-full transition-all duration-500 " +
            (nearCap
              ? "bg-amber-400/70"
              : overHalf
              ? "bg-sky-400/60"
              : "bg-accent/50")
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
