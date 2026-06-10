import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";
import { CrystalBackdrop } from "@/components/crystal-backdrop";

/**
 * Home: editorial hero + two actions (new digest / my digests).
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
      <CrystalBackdrop align="right" />
      <div className="relative z-10">
        <Reveal>
          <p className="font-display text-sm uppercase tracking-[0.3em] text-accent/80">
            Newsletter Studio
          </p>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="font-display mt-4 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
            <span className="text-ice">Hi {firstName}.</span>
            <br />
            <span className="text-slate-500">Your briefing, tailored.</span>
          </h1>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
            Tell Lia what you do and what you want to follow — she finds the right sources,
            and every edition lands on Slack or in your inbox, on your schedule.
          </p>
        </Reveal>

        <Stagger className="mt-14 grid gap-5 sm:grid-cols-2" gap={0.12}>
          <StaggerItem>
            <Link href="/onboarding" className="glass glass-hover group block rounded-3xl p-8">
              <h2 className="font-display text-xl font-semibold tracking-tight text-white">
                Create a digest
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                One conversation with Lia sets up your sources, schedule and channel.
              </p>
              <p className="mt-5 text-sm font-medium text-accent transition-transform duration-300 group-hover:translate-x-1">
                Start →
              </p>
            </Link>
          </StaggerItem>
          <StaggerItem>
            <Link href="/dashboard" className="glass glass-hover group block rounded-3xl p-8">
              <h2 className="font-display text-xl font-semibold tracking-tight text-white">
                My digests
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {subscriptions?.length
                  ? `${subscriptions.length} digest${subscriptions.length > 1 ? "s" : ""} running — history, pause, settings.`
                  : "Nothing running yet — your first digest takes 5 minutes."}
              </p>
              <p className="mt-5 text-sm font-medium text-accent transition-transform duration-300 group-hover:translate-x-1">
                Open →
              </p>
            </Link>
          </StaggerItem>
        </Stagger>
      </div>
    </main>
  );
}
