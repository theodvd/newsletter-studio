"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8">
        <h1 className="text-2xl font-semibold text-white">Newsletter Studio</h1>
        <p className="mt-2 text-sm text-slate-400">
          Crée ta veille personnalisée avec Lia. Entre ton email pour te connecter
          ou créer ton compte.
        </p>

        {authFailed && (
          <p className="mt-4 rounded-lg bg-red-950 p-3 text-sm text-red-300">
            Le lien a expiré ou a été ouvert dans un autre navigateur. Redemande un
            lien et ouvre-le dans ce navigateur.
          </p>
        )}

        {status === "sent" ? (
          <p className="mt-6 rounded-lg bg-emerald-950 p-3 text-sm text-emerald-300">
            Lien envoyé ! Vérifie ta boîte mail et clique sur le lien pour te connecter.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@lia.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {status === "sending" ? "Envoi…" : "Recevoir mon lien de connexion"}
            </button>
            {status === "error" && (
              <p className="text-sm text-red-400">Erreur d&apos;envoi, réessaie.</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
