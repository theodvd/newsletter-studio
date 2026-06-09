import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
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
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">📋 Mes veilles</h1>
        <Link
          href="/onboarding"
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          ✨ Nouvelle veille
        </Link>
      </div>

      {!subscriptions?.length ? (
        <div className="mt-12 rounded-2xl border border-dashed border-slate-700 p-12 text-center">
          <p className="text-slate-400">Aucune veille active pour l&apos;instant.</p>
          <p className="mt-1 text-sm text-slate-500">
            Lance une conversation avec Lia pour créer ta première veille.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {subscriptions.map((sub) => (
            <SubscriptionCard key={sub.id} subscription={sub} />
          ))}
        </div>
      )}

      <p className="mt-10 text-xs text-slate-600">
        Astuce : pour tester un envoi immédiatement, ouvre le workflow « Veille Engine » dans n8n et
        exécute-le avec l&apos;id de ta veille.
      </p>
    </main>
  );
}
