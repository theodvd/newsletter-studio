"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { CrystalBackdrop } from "@/components/crystal-backdrop";

/**
 * Page de connexion : magic link par email, inscription ouverte
 * (le compte est créé automatiquement au premier lien cliqué).
 */
export default function LoginPage() {
  // useSearchParams impose une frontière Suspense au prerender
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

const ease = [0.2, 0.8, 0.2, 1] as const;

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const searchParams = useSearchParams();
  const authFailed = searchParams.get("error") === "auth";

  // Décompte avant de pouvoir redemander un lien (throttle Supabase: 60s)
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** Connexion par le code à 6 chiffres — marche dans n'importe quel navigateur */
  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim().length < 6 || verifying) return;
    setVerifying(true);
    setCodeError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setCodeError(
        `That code doesn't match ${email} — make sure it comes from the email we just sent to that exact address, or resend below.`
      );
      setVerifying(false);
    } else {
      window.location.href = "/";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });
    if (error) {
      // Trigger de capacité (30 comptes) ou throttle 60s entre deux demandes
      setErrorMsg(
        /database error/i.test(error.message)
          ? "We're at capacity for this beta (30 testers). Ask Theo for a seat."
          : /rate limit|security purposes|seconds/i.test(error.message)
            ? "A link was just sent — wait a minute before requesting another one."
            : "Could not send the link — try again."
      );
      setStatus("error");
    } else {
      setStatus("sent");
      setCooldown(60);
      setCode("");
      setCodeError(null);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4">
      {/* Cristal de glace 3D — derrière le contenu, suit la souris */}
      <CrystalBackdrop />

      <motion.div
        initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.9, ease }}
        className="relative z-10 text-center"
      >
        <p className="font-display text-xs uppercase tracking-[0.4em] text-accent/70">
          Powered by Lia
        </p>
        <h1 className="font-display mt-5 text-5xl font-semibold tracking-tight sm:text-7xl">
          <span className="text-ice">Newsletter</span>{" "}
          <span className="text-slate-500">Studio</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-slate-400">
          The briefing that fits you: describe what you do, Lia handles the sources,
          and the essentials reach you — on Slack or by email.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease, delay: 0.2 }}
        className="glass relative z-10 mt-12 w-full max-w-md rounded-3xl p-8"
      >
        {authFailed && (
          <p className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
            That link expired or was opened in a different browser. Request a new one
            and open it in this browser.
          </p>
        )}

        {status === "sent" ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease }}
            className="py-2"
          >
            <p className="font-display text-center font-medium text-white">Check your inbox</p>
            <p className="mt-2 text-center text-sm leading-relaxed text-slate-400">
              We emailed <strong className="text-ice">{email}</strong>. Open the link in this
              browser, <strong>or enter the 6-digit code</strong> from that email — the code
              works anywhere.
            </p>

            <form onSubmit={handleVerifyCode} className="mt-5 flex gap-2">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center font-display text-lg tracking-[0.4em] text-white placeholder-slate-700 outline-none transition-colors focus:border-accent/60"
              />
              <button
                type="submit"
                disabled={code.length < 6 || verifying}
                className="rounded-xl bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-5 font-display text-sm font-semibold text-slate-950 disabled:opacity-40"
              >
                {verifying ? "…" : "Sign in"}
              </button>
            </form>
            {codeError && <p className="mt-2 text-sm text-red-400">{codeError}</p>}

            <p className="mt-5 text-center text-xs text-slate-500">
              Nothing received? Check spam — and in Gmail, make sure you open the{" "}
              <strong>newest</strong> email in the thread.{" "}
              {cooldown > 0 ? (
                <span className="text-slate-600">Resend available in {cooldown}s</span>
              ) : (
                <button
                  onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
                  className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                >
                  Resend the email
                </button>
              )}{" "}
              ·{" "}
              <button
                onClick={() => {
                  setStatus("idle");
                  setCode("");
                  setCodeError(null);
                }}
                className="text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-200"
              >
                Use a different email
              </button>
            </p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-xs font-medium uppercase tracking-widest text-slate-500">
              Your email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base font-normal normal-case tracking-normal text-white placeholder-slate-600 outline-none transition-colors focus:border-accent/60 focus:bg-white/[0.07]"
              />
            </label>
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-xl bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-4 py-3 font-display font-semibold tracking-tight text-slate-950 transition-all duration-300 hover:shadow-[0_0_30px_rgba(124,198,255,0.35)] disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send me a sign-in link"}
            </button>
            {status === "error" && <p className="text-sm text-red-400">{errorMsg}</p>}
          </form>
        )}
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.6 }}
        className="relative z-10 mt-10 text-xs text-slate-600"
      >
        No password — just a magic link. You&apos;ll stay signed in.
      </motion.p>
    </main>
  );
}
