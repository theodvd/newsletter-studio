"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ENGINE_RUN_COST_USD, costUsd, formatUsd, runsPerWeek } from "@/lib/pricing";

/**
 * Conversational onboarding with Lia.
 * Left: chat (markdown rendering, auto-growing textarea, smart scroll).
 * Right: live draft recap + cost estimates + launch button.
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

function slackConnected(d: Draft) {
  return d.destination?.startsWith("https://hooks.slack.com") ?? false;
}

const WELCOME =
  "Hi, I'm Lia. I'll help you build a digest that's actually tailored to you.\n\nTo start: what's your role, and what would you like to keep up with?";

const ease = [0.2, 0.8, 0.2, 1] as const;

/** Markdown léger pour les messages de Lia (pas de plugin typography requis) */
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

export default function OnboardingPage() {
  // useSearchParams impose une frontière Suspense au prerender
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}

function Onboarding() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [messages, setMessages] = useState<ChatMessage[]>(
    editId ? [] : [{ role: "assistant", content: WELCOME }]
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState({ input: 0, output: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const router = useRouter();

  // Smart scroll: only follow new messages if the user is already near the bottom
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    if (stickToBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  // Restore the latest draft, or load the digest being edited (?edit=<id>)
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

  // Auto-grow textarea (capped), keeps the full text visible while typing
  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  async function send() {
    if (!input.trim() || loading) return;
    const next = [...messages, { role: "user" as const, content: input.trim() }];
    setMessages(next);
    setInput("");
    requestAnimationFrame(autosize);
    setLoading(true);
    setError(null);
    stickToBottom.current = true;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, subscriptionId }),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setMessages([...next, { role: "assistant", content: data.reply || "…" }]);
      if (data.subscriptionId) setSubscriptionId(data.subscriptionId);
      if (data.draft) setDraft(data.draft);
      if (data.usage) {
        setTokens((t) => ({
          input: t.input + (data.usage.input_tokens || 0),
          output: t.output + (data.usage.output_tokens || 0),
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setMessages(next);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
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
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      router.push("/dashboard?created=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed");
      setProvisioning(false);
    }
  }

  const conversationCost = costUsd(tokens.input, tokens.output);
  const weeklyRuns = useMemo(() => (draft ? runsPerWeek(draft.frequency_cron) : 0), [draft]);
  const weeklyCost = weeklyRuns * ENGINE_RUN_COST_USD;

  return (
    <main className="mx-auto flex h-screen max-w-6xl gap-5 px-4 pb-5 pt-24">
      {/* Chat */}
      <section className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
        <header className="flex items-center gap-3 border-b border-white/[0.06] px-6 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400/30 to-cyan-300/20 font-display text-sm font-semibold text-ice">
            L
          </span>
          <div>
            <h1 className="font-display text-sm font-semibold tracking-tight text-white">Lia</h1>
            <p className="text-xs text-slate-500">designs your digest with you</p>
          </div>
        </header>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.5, ease }}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                {m.role === "user" ? (
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-br from-sky-500/80 to-cyan-400/70 px-4 py-3 text-sm leading-relaxed text-slate-950">
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-white/[0.06] bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {m.content}
                    </ReactMarkdown>
                  </div>
                )}
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
              Lia is researching and validating sources…
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
              className="max-h-40 min-h-[46px] flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-white placeholder-slate-600 outline-none transition-colors focus:border-accent/50 focus:bg-white/[0.06]"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-5 py-3 font-display text-sm font-semibold text-slate-950 transition-all duration-300 hover:shadow-[0_0_24px_rgba(124,198,255,0.3)] disabled:opacity-30"
            >
              Send
            </button>
          </form>
          {tokens.input + tokens.output > 0 && (
            <p className="mt-2 px-1 text-[11px] text-slate-600">
              This conversation has cost {formatUsd(conversationCost)} in API usage so far.
            </p>
          )}
        </footer>
      </section>

      {/* Draft recap */}
      <aside className="hidden w-80 shrink-0 flex-col gap-4 lg:flex">
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
                <p>
                  Schedule{" "}
                  <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-ice">
                    {draft.frequency_cron}
                  </code>
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
