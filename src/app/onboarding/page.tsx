"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ENGINE_RUN_COST_USD, costUsd, formatUsd, runsPerWeek } from "@/lib/pricing";
import { describeCron } from "@/lib/cron";

/**
 * Conversational onboarding with Lia.
 * Desktop: split chat / draft panel.
 * Mobile: two tabs "Chat" / "Your digest" (h-[100dvh]).
 * Streaming: fetch + ReadableStream, tokens batched with requestAnimationFrame.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  /** True si le message est en cours de stream */
  streaming?: boolean;
};

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

// ─── Constantes ───────────────────────────────────────────────────────────────

function slackConnected(d: Draft) {
  return d.destination?.startsWith("https://hooks.slack.com") ?? false;
}

const WELCOME =
  "Hi, I'm Lia. Tell me what you'd like to keep up with and I'll have a first draft ready for you in seconds.";

const SUGGESTION_CHIPS = [
  "AI & tech news for a product manager",
  "European fintech, weekly summary",
  "Design & UX trends on Slack",
  "Crypto markets, every morning",
];

const ease = [0.2, 0.8, 0.2, 1] as const;

// ─── Markdown renderer ────────────────────────────────────────────────────────

const markdownComponents = {
  h1: (p: React.ComponentProps<"h3">) => <h3 className="mb-1 mt-3 font-display text-base font-semibold text-white" {...p} />,
  h2: (p: React.ComponentProps<"h3">) => <h3 className="mb-1 mt-3 font-display text-base font-semibold text-white" {...p} />,
  h3: (p: React.ComponentProps<"h3">) => <h3 className="mb-1 mt-3 font-display text-sm font-semibold text-white" {...p} />,
  p: (p: React.ComponentProps<"p">) => <p className="my-1.5 leading-relaxed" {...p} />,
  ul: (p: React.ComponentProps<"ul">) => <ul className="my-1.5 list-disc space-y-1 pl-5" {...p} />,
  ol: (p: React.ComponentProps<"ol">) => <ol className="my-1.5 list-decimal space-y-1 pl-5" {...p} />,
  li: (p: React.ComponentProps<"li">) => <li className="leading-relaxed" {...p} />,
  strong: (p: React.ComponentProps<"strong">) => <strong className="font-semibold text-white" {...p} />,
  a: (p: React.ComponentProps<"a">) => (
    <a className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent" target="_blank" rel="noreferrer" {...p} />
  ),
  code: (p: React.ComponentProps<"code">) => (
    <code className="rounded bg-white/10 px-1 py-0.5 text-xs text-ice" {...p} />
  ),
  hr: () => <hr className="my-3 border-white/10" />,
};

// ─── Page wrapper (Suspense pour useSearchParams) ──────────────────────────────

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────

function Onboarding() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [messages, setMessages] = useState<ChatMessage[]>(
    editId ? [] : [{ role: "assistant", content: WELCOME }]
  );
  const [input, setInput] = useState("");
  /** "idle" | "thinking" | "streaming" | "done" */
  const [streamStatus, setStreamStatus] = useState<"idle" | "thinking" | "streaming" | "done">("idle");
  /** Libellé du tool en cours (affiché dans la pastille de statut) */
  const [toolLabel, setToolLabel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUserMsg, setLastUserMsg] = useState<string>("");
  const [tokens, setTokens] = useState({ input: 0, output: 0 });
  /** Index du message assistant en cours de stream (-1 si aucun) */
  const streamingIndexRef = useRef(-1);
  /** Buffer pour le batching des deltas (requestAnimationFrame) */
  const deltaBufferRef = useRef("");
  const rafIdRef = useRef<number | null>(null);
  /** AbortController pour le bouton Stop */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Indique si l'utilisateur est en bas du scroll */
  const stickToBottom = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Onglet mobile actif : "chat" | "digest" */
  const [mobileTab, setMobileTab] = useState<"chat" | "digest">("chat");
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const router = useRouter();

  // ── Scroll intelligent ──────────────────────────────────────────────────────

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickToBottom.current = atBottom;
    setShowScrollBtn(!atBottom);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
    setShowScrollBtn(false);
  }, []);

  // Auto-scroll seulement si l'utilisateur est déjà en bas
  useEffect(() => {
    if (stickToBottom.current) {
      scrollToBottom("smooth");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // ── Chargement du brouillon existant ────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/draft${editId ? `?id=${editId}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.draft) {
          setDraft(data.draft);
          setSubscriptionId(data.draft.id);
          if (editId) {
            setMessages([
              {
                role: "assistant",
                content: `You're editing **${data.draft.name}**${data.draft.status === "active" ? ", which is currently live" : ""}.\n\nTell me what you'd like to change — add or remove sources, adjust the schedule, the tone, or the focus — and I'll apply it right away.`,
              },
            ]);
          }
        } else if (editId) {
          setMessages([{ role: "assistant", content: WELCOME }]);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // ── Autosize du textarea ──────────────────────────────────────────────────────

  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  // ── Envoi et streaming ────────────────────────────────────────────────────────

  /**
   * Flush le buffer de deltas accumulés vers le message assistant en stream.
   * Appelé via requestAnimationFrame pour regrouper plusieurs tokens.
   */
  const flushDelta = useCallback(() => {
    const text = deltaBufferRef.current;
    if (!text) return;
    deltaBufferRef.current = "";
    rafIdRef.current = null;

    setMessages((prev) => {
      const idx = streamingIndexRef.current;
      if (idx < 0 || idx >= prev.length) return prev;
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        content: updated[idx].content + text,
      };
      return updated;
    });
  }, []);

  /** Empile un delta dans le buffer et planifie un flush. */
  const enqueueDelta = useCallback(
    (text: string) => {
      deltaBufferRef.current += text;
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushDelta);
      }
    },
    [flushDelta]
  );

  async function send(messageOverride?: string) {
    const text = (messageOverride ?? input).trim();
    if (!text || streamStatus !== "idle") return;

    // Annule tout AbortController précédent
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const userMsg: ChatMessage = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setLastUserMsg(text);
    setInput("");
    requestAnimationFrame(autosize);
    setError(null);
    stickToBottom.current = true;
    setStreamStatus("thinking");
    setToolLabel(null);

    // Prépare un message assistant vide qui se remplira en stream
    const assistantIdx = next.length;
    const assistantPlaceholder: ChatMessage = {
      role: "assistant",
      content: "",
      streaming: true,
    };
    setMessages([...next, assistantPlaceholder]);
    streamingIndexRef.current = assistantIdx;
    deltaBufferRef.current = "";

    // Messages à envoyer au serveur (sans le placeholder vide)
    const apiMessages = next.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, subscriptionId }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok || !res.body) {
        // Erreur HTTP (ex: 429) — le corps peut contenir un event SSE d'erreur
        const text = await res.text();
        let message = `Request failed (${res.status})`;
        try {
          const match = text.match(/data: (.+)/);
          if (match) {
            const parsed = JSON.parse(match[1]);
            if (parsed.message) message = parsed.message;
          }
        } catch { /* ignore */ }
        throw new Error(message);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = "";

      // Dès qu'on commence à lire : "thinking" → "streaming"
      setStreamStatus("streaming");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: Record<string, unknown>;
          try { event = JSON.parse(raw); } catch { continue; }

          switch (event.type) {
            case "delta":
              enqueueDelta(String(event.text ?? ""));
              setToolLabel(null);
              break;

            case "status":
              // Flush immédiat avant d'afficher le statut
              if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
                flushDelta();
              }
              setToolLabel(String(event.label ?? ""));
              break;

            case "draft":
              if (event.draft && typeof event.draft === "object") {
                setDraft(event.draft as Draft);
              }
              if (event.subscriptionId) {
                setSubscriptionId(String(event.subscriptionId));
              }
              break;

            case "done":
              if (event.subscriptionId) {
                setSubscriptionId(String(event.subscriptionId));
              }
              if (event.usage && typeof event.usage === "object") {
                const u = event.usage as { input_tokens?: number; output_tokens?: number };
                setTokens((t) => ({
                  input: t.input + (u.input_tokens ?? 0),
                  output: t.output + (u.output_tokens ?? 0),
                }));
              }
              break;

            case "error":
              throw new Error(String(event.message ?? "Something went wrong"));
          }
        }
      }

      // Flush final des deltas restants
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      flushDelta();
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") {
        // L'utilisateur a cliqué Stop : on garde le texte déjà affiché
      } else {
        setError(e instanceof Error ? e.message : "Something went wrong");
        // Retire le placeholder vide si aucun texte n'a été émis
        setMessages((prev) => {
          const idx = streamingIndexRef.current;
          if (idx >= 0 && idx < prev.length && prev[idx].content === "") {
            return prev.slice(0, idx);
          }
          return prev;
        });
      }
    } finally {
      // Retire le flag streaming du message
      setMessages((prev) => {
        const idx = streamingIndexRef.current;
        if (idx < 0 || idx >= prev.length) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], streaming: false };
        return updated;
      });
      streamingIndexRef.current = -1;
      setStreamStatus("idle");
      setToolLabel(null);
      textareaRef.current?.focus();
    }
  }

  function stop() {
    abortControllerRef.current?.abort();
  }

  // ── Provision ────────────────────────────────────────────────────────────────

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
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      router.push("/dashboard?created=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed");
      setProvisioning(false);
    }
  }

  // ── Calculs ────────────────────────────────────────────────────────────────

  const conversationCost = costUsd(tokens.input, tokens.output);
  const weeklyRuns = useMemo(() => (draft ? runsPerWeek(draft.frequency_cron) : 0), [draft]);
  const weeklyCost = weeklyRuns * ENGINE_RUN_COST_USD;

  /** Vrai si la conversation n'a que le message d'accueil initial */
  const showChips =
    messages.length === 1 &&
    messages[0].role === "assistant" &&
    streamStatus === "idle";

  const isGenerating = streamStatus === "thinking" || streamStatus === "streaming";

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <main className="flex h-[100dvh] max-w-6xl flex-col gap-5 px-4 pb-5 pt-24 lg:mx-auto lg:flex-row">
      {/* ── Onglets mobile ────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 gap-2 lg:hidden">
        <button
          onClick={() => setMobileTab("chat")}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
            mobileTab === "chat"
              ? "bg-white/10 text-white"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setMobileTab("digest")}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
            mobileTab === "digest"
              ? "bg-white/10 text-white"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          Your digest
          {draft && (
            <span className="ml-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" />
          )}
        </button>
      </div>

      {/* ── Panneau chat ─────────────────────────────────────────────────────── */}
      <section
        className={`glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl ${
          mobileTab !== "chat" ? "hidden lg:flex" : "flex"
        }`}
      >
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400/30 to-cyan-300/20 font-display text-sm font-semibold text-ice">
            L
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-sm font-semibold tracking-tight text-white">Lia</h1>
            <p className="text-xs text-slate-500">designs your digest with you</p>
          </div>

          {/* Pastille de statut (outil en cours) */}
          <AnimatePresence>
            {toolLabel && (
              <motion.span
                key={toolLabel}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="hidden shrink-0 truncate rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1 text-xs text-slate-400 sm:block"
              >
                {toolLabel}
              </motion.span>
            )}
          </AnimatePresence>
        </header>

        {/* Fil de messages */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative flex-1 overflow-y-auto px-6 py-6"
          aria-live="polite"
          aria-label="Conversation with Lia"
        >
          <div className="space-y-5">
            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.35, ease }}
                  className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  {m.role === "user" ? (
                    /* Message utilisateur : bulle alignée à droite */
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-sky-500/80 to-cyan-400/70 px-4 py-3 text-[15px] leading-relaxed text-slate-950">
                      {m.content}
                    </div>
                  ) : (
                    /* Message assistant : pleine largeur, label Lia */
                    <div className="w-full max-w-[72ch] space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-sky-400/20 to-cyan-300/10 text-[10px] font-semibold text-ice">
                          L
                        </span>
                        <span>Lia</span>
                      </div>
                      <div className="text-[15px] leading-relaxed text-slate-200">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {m.content}
                        </ReactMarkdown>
                        {/* Curseur clignotant pendant le stream */}
                        {m.streaming && (
                          <span className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-[0.1em] animate-pulse rounded-sm bg-slate-400 align-middle" />
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Indicateur "thinking" (avant le premier token) */}
            {streamStatus === "thinking" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3"
              >
                <div className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
                  {[0, 1, 2].map((j) => (
                    <span
                      key={j}
                      className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-bounce"
                      style={{ animationDelay: `${j * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-500">Lia is thinking…</span>
              </motion.div>
            )}

            {/* Pastille de statut (outil) sur mobile */}
            <AnimatePresence>
              {toolLabel && (
                <motion.div
                  key={toolLabel}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="sm:hidden flex items-center gap-2 text-xs text-slate-500"
                >
                  <span className="h-1 w-1 rounded-full bg-accent animate-pulse" />
                  {toolLabel}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Suggestion chips sous le message d'accueil (empty state) */}
          <AnimatePresence>
            {showChips && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="mt-6 flex flex-wrap gap-2 pl-7"
              >
                {SUGGESTION_CHIPS.map((chip, i) => (
                  <motion.button
                    key={chip}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.05, duration: 0.25 }}
                    onClick={() => {
                      setInput(chip);
                      // Envoie immédiatement la suggestion
                      requestAnimationFrame(() => send(chip));
                    }}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-sm text-slate-300 transition-colors hover:border-accent/30 hover:bg-accent/10 hover:text-accent"
                    aria-label={`Suggestion: ${chip}`}
                  >
                    {chip}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={bottomRef} />

          {/* Bouton scroll-to-bottom */}
          <AnimatePresence>
            {showScrollBtn && (
              <motion.button
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.15 }}
                onClick={() => scrollToBottom()}
                aria-label="Scroll to latest message"
                className="sticky bottom-4 ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-900/80 text-slate-300 shadow-lg backdrop-blur-sm hover:border-accent/40 hover:text-accent"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M7 2v10M3 8l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Erreur + Retry */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 px-6 pb-2"
            >
              <p className="flex-1 text-sm text-red-400">{error}</p>
              {lastUserMsg && (
                <button
                  onClick={() => {
                    setError(null);
                    send(lastUserMsg);
                  }}
                  className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
                  aria-label="Retry last message"
                >
                  Retry
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Composer */}
        <footer className="border-t border-white/[0.06] p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                autosize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Reply to Lia… (Shift+Enter for a new line)"
              autoCorrect="off"
              autoCapitalize="off"
              aria-label="Message to Lia"
              className="max-h-40 min-h-[46px] flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] leading-relaxed text-white placeholder-slate-600 outline-none transition-colors focus:border-accent/50 focus:bg-white/[0.06] disabled:opacity-50"
            />

            {isGenerating ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop generation"
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-slate-300 transition-colors hover:border-red-500/40 hover:text-red-400"
              >
                {/* Icône carré "stop" */}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                  <rect x="2" y="2" width="10" height="10" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send message"
                className="rounded-xl bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-5 py-3 font-display text-sm font-semibold text-slate-950 transition-all duration-300 hover:shadow-[0_0_24px_rgba(124,198,255,0.3)] disabled:opacity-30"
              >
                Send
              </button>
            )}
          </form>

          {tokens.input + tokens.output > 0 && (
            <p className="mt-2 px-1 text-[11px] text-slate-600">
              This conversation has used {formatUsd(conversationCost)} in API credits so far.
            </p>
          )}
        </footer>
      </section>

      {/* ── Panneau draft ─────────────────────────────────────────────────────── */}
      <aside
        className={`shrink-0 flex-col gap-4 lg:flex lg:w-80 ${
          mobileTab === "digest" ? "flex w-full" : "hidden"
        }`}
      >
        <div className="glass rounded-3xl p-6">
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Your digest
          </h2>

          {!draft ? (
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              The summary will build up here as you chat.
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
                    Email <span className="text-slate-300">→ {draft.destination}</span>
                  </p>
                ) : slackConnected(draft) ? (
                  <p>
                    Slack{" "}
                    <span className="text-emerald-300">
                      — connected ({draft.destination_label || "channel"})
                    </span>
                  </p>
                ) : (
                  <a
                    href={`/api/slack/install?subscription=${draft.id}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
                  >
                    Connect Slack
                  </a>
                )}
                <p title={draft.frequency_cron}>
                  Schedule{" "}
                  <span className="text-slate-300">— {describeCron(draft.frequency_cron)}</span>
                </p>
                {draft.tone && <p>Tone — {draft.tone}</p>}
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
                      <span
                        className={
                          s.validation_status === "valid"
                            ? "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
                            : "h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                        }
                      />
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

              <div className="border-t border-white/[0.06] pt-3 text-xs leading-relaxed text-slate-500">
                <p>
                  Estimated running cost:{" "}
                  <span className="text-slate-300">~{formatUsd(weeklyCost)}/week</span>{" "}
                  ({weeklyRuns} {weeklyRuns > 1 ? "deliveries" : "delivery"}/week, ~
                  {formatUsd(ENGINE_RUN_COST_USD)} each)
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Bouton Launch / live indicator */}
        <AnimatePresence>
          {draft && draft.status === "active" ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease }}
              className="glass rounded-2xl p-4 text-center"
            >
              <p className="text-xs leading-relaxed text-slate-400">
                This digest is live — changes apply immediately as you chat.
              </p>
              <a
                href="/dashboard"
                className="mt-3 inline-block rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-accent/40"
              >
                Back to dashboard
              </a>
            </motion.div>
          ) : draft ? (
            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease }}
              onClick={provision}
              disabled={provisioning || (draft.channel === "slack" && !slackConnected(draft))}
              aria-label="Launch my digest"
              title={
                draft.channel === "slack" && !slackConnected(draft)
                  ? "Connect your Slack first (button above)"
                  : undefined
              }
              className="rounded-2xl bg-gradient-to-r from-emerald-400/90 to-teal-300/90 px-5 py-4 font-display font-semibold tracking-tight text-slate-950 transition-all duration-300 hover:shadow-[0_0_30px_rgba(52,211,153,0.3)] disabled:opacity-40"
            >
              {provisioning ? "Creating your workflow…" : "Launch my digest"}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </aside>
    </main>
  );
}
