"use client";

import { Suspense, useState } from "react";
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
  const searchParams = useSearchParams();
  const authFailed = searchParams.get("error") === "auth";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });
    setStatus(error ? "error" : "sent");
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
          Propulsé par Lia
        </p>
        <h1 className="font-display mt-5 text-5xl font-semibold tracking-tight sm:text-7xl">
          <span className="text-ice">Newsletter</span>{" "}
          <span className="text-slate-500">Studio</span>
        </h1>
        <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-slate-400">
          La veille qui te ressemble : décris ton métier, Lia s&apos;occupe des sources,
          tu reçois l&apos;essentiel — sur Slack ou par email.
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
            Le lien a expiré ou a été ouvert dans un autre navigateur. Redemande un lien
            et ouvre-le dans ce navigateur.
          </p>
        )}

        {status === "sent" ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease }}
            className="py-4 text-center"
          >
            <div className="text-3xl">📬</div>
            <p className="font-display mt-3 font-medium text-white">Lien envoyé !</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Vérifie ta boîte mail et ouvre le lien <strong>dans ce navigateur</strong>{" "}
              pour te connecter.
            </p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-xs font-medium uppercase tracking-widest text-slate-500">
              Ton email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom@entreprise.com"
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base font-normal normal-case tracking-normal text-white placeholder-slate-600 outline-none transition-colors focus:border-accent/60 focus:bg-white/[0.07]"
              />
            </label>
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-xl bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-4 py-3 font-display font-semibold tracking-tight text-slate-950 transition-all duration-300 hover:shadow-[0_0_30px_rgba(124,198,255,0.35)] disabled:opacity-50"
            >
              {status === "sending" ? "Envoi…" : "Recevoir mon lien de connexion"}
            </button>
            {status === "error" && (
              <p className="text-sm text-red-400">Erreur d&apos;envoi, réessaie.</p>
            )}
          </form>
        )}
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.6 }}
        className="relative z-10 mt-10 text-xs text-slate-600"
      >
        Pas de mot de passe — un lien magique, c&apos;est tout.
      </motion.p>
    </main>
  );
}
