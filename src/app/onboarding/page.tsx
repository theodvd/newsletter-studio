"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Onboarding conversationnel avec Lia.
 * Colonne gauche : chat. Colonne droite : récap du brouillon
 * (mis à jour quand l'agent appelle save_subscription_config)
 * + bouton « Valider et lancer ma veille » → /api/provision.
 */

type ChatMessage = { role: "user" | "assistant"; content: string };

type DraftSource = {
  url: string;
  feed_url: string | null;
  title: string | null;
  type: string;
  validation_status: string;
  added_by: string;
};

type Draft = {
  id: string;
  name: string;
  channel: string;
  destination: string | null;
  destination_label: string | null;
  frequency_cron: string;
  tone: string | null;
  language: string;
  status: string;
  sources: DraftSource[];
};

/** Webhook Slack connecté via OAuth ? */
function slackConnected(d: Draft) {
  return d.destination?.startsWith("https://hooks.slack.com") ?? false;
}

const WELCOME =
  "Salut, moi c'est Lia 👋 Je vais t'aider à monter ta veille sur mesure.\n\nPour commencer : c'est quoi ton rôle, et qu'est-ce que tu aimerais suivre au quotidien ?";

const ease = [0.2, 0.8, 0.2, 1] as const;

export default function OnboardingPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: WELCOME }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Restaure le dernier brouillon (permet de re-valider après un refresh)
  useEffect(() => {
    fetch("/api/draft")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.draft) {
          setDraft(data.draft);
          setSubscriptionId(data.draft.id);
        }
      })
      .catch(() => {});
  }, []);

  async function send() {
    if (!input.trim() || loading) return;
    const next = [...messages, { role: "user" as const, content: input.trim() }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, subscriptionId }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.reply || "…" }]);
      if (data.subscriptionId) setSubscriptionId(data.subscriptionId);
      if (data.draft) setDraft(data.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue");
      setMessages(next);
    } finally {
      setLoading(false);
    }
  }

  async function provision() {
    if (!subscriptionId || provisioning) return;
    setProvisioning(true);
    setError(null);
    try {
      const res = await fetch("/api/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      router.push("/dashboard?created=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur au lancement");
      setProvisioning(false);
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-6xl gap-5 px-4 pb-5 pt-24">
      {/* Chat */}
      <section className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
        <header className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400/30 to-cyan-300/20 text-base">
            ❄︎
          </span>
          <div>
            <h1 className="font-display text-sm font-semibold tracking-tight text-white">Lia</h1>
            <p className="text-xs text-slate-500">conçoit ta veille avec toi</p>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.5, ease }}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-sky-500/80 to-cyan-400/70 px-4 py-3 text-sm leading-relaxed text-slate-950"
                      : "max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-slate-100"
                  }
                >
                  {m.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 text-xs text-slate-500"
            >
              <span className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </span>
              Lia recherche et valide les sources…
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="px-6 pb-2 text-sm text-red-400">{error}</p>}

        <footer className="border-t border-white/[0.06] p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Réponds à Lia…"
              className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-colors focus:border-accent/50 focus:bg-white/[0.06]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-5 py-3 font-display text-sm font-semibold text-slate-950 transition-all duration-300 hover:shadow-[0_0_24px_rgba(124,198,255,0.3)] disabled:opacity-30"
            >
              Envoyer
            </button>
          </form>
        </footer>
      </section>

      {/* Récap du brouillon */}
      <aside className="hidden w-80 shrink-0 flex-col gap-4 lg:flex">
        <div className="glass rounded-3xl p-6">
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Récap de ta veille
          </h2>
          {!draft ? (
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              Le récap se construira ici au fil de la conversation.
            </p>
          ) : (
            <motion.div
              key={JSON.stringify(draft.sources?.length) + draft.name}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="mt-4 space-y-4 text-sm"
            >
              <p className="font-display text-base font-semibold tracking-tight text-white">
                {draft.name}
              </p>
              <div className="space-y-1.5 text-slate-400">
                {draft.channel === "email" ? (
                  <p>
                    📧 Email <span className="text-slate-300">→ {draft.destination}</span>
                  </p>
                ) : slackConnected(draft) ? (
                  <p>
                    💬 Slack{" "}
                    <span className="text-emerald-300">
                      ✓ {draft.destination_label || "connecté"}
                    </span>
                  </p>
                ) : (
                  <a
                    href={`/api/slack/install?subscription=${draft.id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
                  >
                    🔗 Connecter Slack
                  </a>
                )}
                <p>
                  ⏰ <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-ice">{draft.frequency_cron}</code>
                </p>
                {draft.tone && <p>🎯 {draft.tone}</p>}
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-widest text-slate-600">
                  Sources · {draft.sources?.length ?? 0}
                </p>
                <ul className="space-y-1.5">
                  {draft.sources?.map((s, i) => (
                    <motion.li
                      key={s.url}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.4, ease }}
                      className="flex items-center gap-2 truncate text-slate-300"
                    >
                      <span>{s.validation_status === "valid" ? "✅" : "⚠️"}</span>
                      <span className="truncate">{s.title || s.url}</span>
                      {s.added_by === "lia" && (
                        <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                          Lia
                        </span>
                      )}
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {draft && (
            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease }}
              onClick={provision}
              disabled={provisioning || (draft.channel === "slack" && !slackConnected(draft))}
              title={
                draft.channel === "slack" && !slackConnected(draft)
                  ? "Connecte d'abord ton Slack via le bouton du récap"
                  : undefined
              }
              className="rounded-2xl bg-gradient-to-r from-emerald-400/90 to-teal-300/90 px-5 py-4 font-display font-semibold tracking-tight text-slate-950 transition-all duration-300 hover:shadow-[0_0_30px_rgba(52,211,153,0.3)] disabled:opacity-50"
            >
              {provisioning ? "Création du workflow…" : "🚀 Valider et lancer ma veille"}
            </motion.button>
          )}
        </AnimatePresence>
      </aside>
    </main>
  );
}
