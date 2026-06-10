import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";
import { SubscriptionCard } from "./subscription-card";

export const dynamic = "force-dynamic";

/**
 * Dashboard : mes veilles (statut, fréquence, canal) + derniers envois.
 */
export default async function DashboardPage() {
  const supabase = createClient();

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select(
      "id, name, channel, destination, frequency_cron, status, n8n_workflow_id, created_at, sources(id), deliveries(id, sent_at, status)"
    )
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
      <Reveal className="flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-accent/70">
            Dashboard
          </p>
          <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight text-ice">
            Mes veilles
          </h1>
        </div>
        <Link
          href="/onboarding"
          className="rounded-xl bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-4 py-2.5 font-display text-sm font-semibold text-slate-950 transition-all duration-300 hover:shadow-[0_0_24px_rgba(124,198,255,0.3)]"
        >
          ✨ Nouvelle veille
        </Link>
      </Reveal>

      {!subscriptions?.length ? (
        <Reveal delay={0.1}>
          <div className="glass mt-10 rounded-3xl p-14 text-center">
            <div className="text-4xl">🧊</div>
            <p className="font-display mt-4 font-medium text-white">
              Aucune veille active pour l&apos;instant
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Lance une conversation avec Lia — la première se monte en 5 minutes.
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
