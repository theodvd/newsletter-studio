import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";
import { CrystalBackdrop } from "@/components/crystal-backdrop";

/**
 * Accueil : hero typographique + 2 actions (nouvelle veille / mes veilles).
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

  const firstName =
    user?.email?.split("@")[0]?.split(".")[0]?.replace(/^./, (c) => c.toUpperCase()) ?? "";

  return (
    <main className="relative mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 pb-24 pt-32">
      {/* Cristal 3D décalé à droite pour équilibrer le hero */}
      <CrystalBackdrop align="right" />
      <div className="relative z-10">
      <Reveal>
        <p className="font-display text-sm uppercase tracking-[0.3em] text-accent/80">
          Newsletter Studio
        </p>
      </Reveal>
      <Reveal delay={0.08}>
        <h1 className="font-display mt-4 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
          <span className="text-ice">Bonjour {firstName}.</span>
          <br />
          <span className="text-slate-500">Ta veille, sur mesure.</span>
        </h1>
      </Reveal>
      <Reveal delay={0.16}>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
          Décris ton métier et ce que tu veux suivre — Lia déniche les bonnes sources,
          et chaque édition arrive sur Slack ou par email, au rythme que tu choisis.
        </p>
      </Reveal>

      <Stagger className="mt-14 grid gap-5 sm:grid-cols-2" gap={0.12}>
        <StaggerItem>
          <Link
            href="/onboarding"
            className="glass glass-hover group block rounded-3xl p-8"
          >
            <div className="text-3xl">✨</div>
            <h2 className="font-display mt-4 text-xl font-semibold tracking-tight text-white">
              Créer une veille
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Une conversation avec Lia suffit pour configurer sources, fréquence et canal.
            </p>
            <p className="mt-5 text-sm font-medium text-accent transition-transform duration-300 group-hover:translate-x-1">
              Commencer →
            </p>
          </Link>
        </StaggerItem>
        <StaggerItem>
          <Link href="/dashboard" className="glass glass-hover group block rounded-3xl p-8">
            <div className="text-3xl">🧊</div>
            <h2 className="font-display mt-4 text-xl font-semibold tracking-tight text-white">
              Mes veilles
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {subscriptions?.length
                ? `${subscriptions.length} veille${subscriptions.length > 1 ? "s" : ""} configurée${subscriptions.length > 1 ? "s" : ""} — historique, pause, réglages.`
                : "Aucune veille pour l'instant — la première se crée en 5 minutes."}
            </p>
            <p className="mt-5 text-sm font-medium text-accent transition-transform duration-300 group-hover:translate-x-1">
              Ouvrir →
            </p>
          </Link>
        </StaggerItem>
      </Stagger>
      </div>
    </main>
  );
}
