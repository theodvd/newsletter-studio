"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
  destination: string;
  frequency_cron: string;
  tone: string | null;
  language: string;
  status: string;
  sources: DraftSource[];
};

const WELCOME =
  "Salut, moi c'est Lia 👋 Je vais t'aider à monter ta veille sur mesure.\n\nPour commencer : c'est quoi ton rôle, et qu'est-ce que tu aimerais suivre au quotidien ?";

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
    <main className="mx-auto flex h-screen max-w-6xl gap-6 px-6 py-6">
      {/* Chat */}
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-slate-800 bg-slate-900">
        <header className="border-b border-slate-800 px-5 py-3">
          <h1 className="font-medium text-white">✨ Nouvelle veille avec Lia</h1>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 text-sm text-white"
                    : "max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-800 px-4 py-2.5 text-sm text-slate-100"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-400" />
              Lia réfléchit (recherche et validation des sources)…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        {error && <p className="px-5 pb-2 text-sm text-red-400">{error}</p>}
        <footer className="border-t border-slate-800 p-4">
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
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              Envoyer
            </button>
          </form>
        </footer>
      </section>

      {/* Récap du brouillon */}
      <aside className="hidden w-80 shrink-0 flex-col gap-4 lg:flex">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Récap de ta veille</h2>
          {!draft ? (
            <p className="mt-3 text-sm text-slate-500">
              Le récap apparaîtra ici au fil de la conversation.
            </p>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <p className="font-medium text-white">{draft.name}</p>
              <p className="text-slate-400">
                {draft.channel === "slack" ? "💬 Slack" : "📧 Email"} → {draft.destination}
              </p>
              <p className="text-slate-400">⏰ Cron : <code className="text-slate-300">{draft.frequency_cron}</code></p>
              {draft.tone && <p className="text-slate-400">🎯 Ton : {draft.tone}</p>}
              <div>
                <p className="mb-1 text-slate-400">Sources ({draft.sources?.length ?? 0}) :</p>
                <ul className="space-y-1">
                  {draft.sources?.map((s, i) => (
                    <li key={i} className="truncate text-slate-300">
                      {s.validation_status === "valid" ? "✅" : "⚠️"} {s.title || s.url}
                      {s.added_by === "lia" && <span className="ml-1 text-xs text-indigo-400">(Lia)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
        {draft && (
          <button
            onClick={provision}
            disabled={provisioning}
            className="rounded-2xl bg-emerald-600 px-5 py-3 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {provisioning ? "Création du workflow…" : "🚀 Valider et lancer ma veille"}
          </button>
        )}
      </aside>
    </main>
  );
}
