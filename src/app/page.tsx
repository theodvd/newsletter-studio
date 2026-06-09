import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Accueil : point d'entrée vers l'onboarding (nouvelle veille)
 * et le dashboard (veilles existantes).
 */
export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select("id, name, status")
    .neq("status", "draft")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold text-white">Bonjour 👋</h1>
      <p className="mt-2 text-slate-400">
        Connecté en tant que {user?.email}. Que veux-tu faire ?
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/onboarding"
          className="rounded-2xl border border-indigo-800 bg-indigo-950/50 p-6 transition hover:border-indigo-500"
        >
          <h2 className="text-lg font-medium text-white">✨ Créer une veille</h2>
          <p className="mt-1 text-sm text-slate-400">
            Discute avec Lia pour configurer ta newsletter ou tes alertes Slack.
          </p>
        </Link>
        <Link
          href="/dashboard"
          className="rounded-2xl border border-slate-800 bg-slate-900 p-6 transition hover:border-slate-600"
        >
          <h2 className="text-lg font-medium text-white">📋 Mes veilles</h2>
          <p className="mt-1 text-sm text-slate-400">
            {subscriptions?.length
              ? `${subscriptions.length} veille(s) configurée(s)`
              : "Aucune veille pour l'instant"}
          </p>
        </Link>
      </div>
    </main>
  );
}
