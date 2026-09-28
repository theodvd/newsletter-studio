import Link from "next/link";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";
import { SubscriptionCard } from "./subscription-card";
import { ApiKeyPanel } from "./api-key-panel";
import { HistoryPanel } from "./history-panel";

export const dynamic = "force-dynamic";

/**
 * Dashboard: running digests (status, schedule, channel) + recent deliveries,
 * et la connexion de la clé du fournisseur (BYOK).
 */
export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: subscriptions }, { data: profile }, { data: historyProfile }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "id, name, channel, destination, destination_label, frequency_cron, status, created_at, design, sources(id), deliveries(id, sent_at, status)"
      )
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("llm_provider, llm_key_hint").maybeSingle(),
    // `keep_history` est server-only (voir 0009_history.sql) : hors des
    // colonnes accordées à `authenticated`, une lecture avec le client à
    // session échouerait. Composant serveur, jamais exposé au navigateur :
    // la clé service reste sûre ici, avec un filtre de propriété explicite.
    user
      ? createAdminClient().from("profiles").select("keep_history").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
      <Reveal className="flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-accent/70">
            Dashboard
          </p>
          <div className="mt-3">
            <h1 className="font-display text-4xl font-semibold tracking-tight text-ice">
              My digests
            </h1>
          </div>
        </div>
        <Link
          href="/onboarding"
          className="rounded-xl bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-4 py-2.5 font-display text-sm font-semibold text-slate-950 transition-all duration-300 hover:shadow-[0_0_24px_rgba(124,198,255,0.3)]"
        >
          New digest
        </Link>
      </Reveal>

      {/* Clé du fournisseur : c'est elle qui fait tourner les éditions */}
      <Reveal delay={0.05}>
        <ApiKeyPanel
          provider={profile?.llm_provider ?? null}
          hint={profile?.llm_key_hint ?? null}
        />
      </Reveal>

      {/* Conservation de l'historique de conversation avec Lia (opt-in) */}
      <Reveal delay={0.08}>
        <HistoryPanel initialKeepHistory={historyProfile?.keep_history ?? null} />
      </Reveal>

      {!subscriptions?.length ? (
        <Reveal delay={0.1}>
          <div className="glass mt-10 rounded-3xl p-14 text-center">
            <p className="font-display font-medium text-white">Nothing running yet</p>
            <p className="mt-2 text-sm text-slate-500">
              Start a conversation with Lia. Your first digest takes about 5 minutes.
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
