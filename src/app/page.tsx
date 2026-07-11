import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Reveal, Stagger, StaggerItem } from "@/components/reveal";
import { CrystalBackdrop } from "@/components/crystal-backdrop";
import { PRO_PRICE_MONTHLY_EUR, PRO_PRICE_YEARLY_EUR } from "@/lib/plan";

/**
 * Home: editorial hero + two actions (new digest / my digests) + pricing section.
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

        {/* ------------------------------------------------------------------ */}
        {/*  Section Pricing                                                     */}
        {/* ------------------------------------------------------------------ */}
        <section id="pricing" className="mt-28">
          <Reveal>
            <p className="font-display text-xs uppercase tracking-[0.3em] text-accent/70">
              Plans
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-ice">
              Simple, transparent pricing
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
              Start free, upgrade when you want your briefing every morning.
            </p>
          </Reveal>

          <Stagger className="mt-10 grid gap-5 sm:grid-cols-2" gap={0.1}>
            {/* Free card */}
            <StaggerItem>
              <div className="glass flex h-full flex-col rounded-3xl p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-display text-lg font-semibold text-white">Free</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-ice">
                      €0
                      <span className="ml-1 text-sm font-normal text-slate-500">/month</span>
                    </p>
                  </div>
                  <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                    Current
                  </span>
                </div>

                <ul className="mt-7 flex-1 space-y-3 text-sm text-slate-400">
                  <PricingFeature>1 active digest</PricingFeature>
                  <PricingFeature>Weekly or light daily delivery (up to 5 sources)</PricingFeature>
                  <PricingFeature>Email & Slack delivery</PricingFeature>
                  <PricingFeature>Standard AI summaries</PricingFeature>
                </ul>

                <Link
                  href="/onboarding"
                  className="mt-8 block rounded-xl border border-white/10 py-2.5 text-center text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white"
                >
                  Get started
                </Link>
              </div>
            </StaggerItem>

            {/* Pro card */}
            <StaggerItem>
              <div className="glass flex h-full flex-col rounded-3xl border border-sky-400/20 p-8">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-display text-lg font-semibold text-white">Pro</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-ice">
                      €{PRO_PRICE_MONTHLY_EUR}
                      <span className="ml-1 text-sm font-normal text-slate-500">/month</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      or €{PRO_PRICE_YEARLY_EUR}/year
                    </p>
                  </div>
                  <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300">
                    Coming soon
                  </span>
                </div>

                <ul className="mt-7 flex-1 space-y-3 text-sm text-slate-400">
                  <PricingFeature highlight>Up to 3 active digests</PricingFeature>
                  <PricingFeature highlight>Daily or twice-daily delivery</PricingFeature>
                  <PricingFeature highlight>Up to 12 sources per digest</PricingFeature>
                  <PricingFeature highlight>Deeper AI analysis & context</PricingFeature>
                  <PricingFeature highlight>Priority source freshness</PricingFeature>
                  <PricingFeature>Email & Slack delivery</PricingFeature>
                </ul>

                <a
                  href={`mailto:theodavid2005@gmail.com?subject=${encodeURIComponent("Newsletter Studio Pro")}`}
                  className="mt-8 block rounded-xl bg-gradient-to-r from-sky-400/90 to-cyan-300/90 py-2.5 text-center text-sm font-semibold text-slate-950 transition-all duration-300 hover:shadow-[0_0_24px_rgba(124,198,255,0.25)]"
                >
                  Join the waitlist
                </a>
              </div>
            </StaggerItem>
          </Stagger>
        </section>
      </div>
    </main>
  );
}

/** Puce de feature pricing, optionnellement mise en valeur. */
function PricingFeature({
  children,
  highlight = false,
}: {
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={
          "mt-0.5 text-base leading-none " +
          (highlight ? "text-sky-400" : "text-slate-600")
        }
      >
        {highlight ? "◆" : "◇"}
      </span>
      <span className={highlight ? "text-slate-300" : ""}>{children}</span>
    </li>
  );
}
