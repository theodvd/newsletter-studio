"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { injectBaseTarget } from "@/lib/preview/base-target";
import type { PreviewPayload } from "@/lib/preview/payload";

export type { PreviewPayload };

/**
 * Modale d'aperçu d'une veille : contenu d'exemple ou dernière édition
 * générée, génération réelle sur les sources de l'utilisateur, et envoi d'un
 * test à sa propre adresse.
 *
 * `initialData` + `fetcher` permettent de la monter sans réseau (harnais
 * `/dev/preview`, QA visuelle).
 */

type Fetcher = typeof fetch;

export type PreviewDialogProps = {
  open: boolean;
  onClose: () => void;
  subscriptionId: string;
  subscriptionName: string;
  /** Contourne le GET initial : sert au harnais de QA visuelle hors-ligne. */
  initialData?: PreviewPayload;
  /** Remplace `fetch` global : sert au harnais de QA visuelle hors-ligne. */
  fetcher?: Fetcher;
};

const ease = [0.2, 0.8, 0.2, 1] as const;

function formatGeneratedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function PreviewDialog({
  open,
  onClose,
  subscriptionId,
  subscriptionName,
  initialData,
  fetcher,
}: PreviewDialogProps) {
  const [payload, setPayload] = useState<PreviewPayload | null>(initialData ?? null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [sendOutcome, setSendOutcome] = useState<"idle" | "success" | "error">("idle");
  const [sendError, setSendError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useMemo<Fetcher>(() => fetcher ?? fetch, [fetcher]);

  // ── Chargement initial (ou reprise de `initialData`, sans réseau) ────────
  useEffect(() => {
    if (!open) return;
    if (initialData) {
      setPayload(initialData);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    doFetch(`/api/preview?subscriptionId=${encodeURIComponent(subscriptionId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data?.error || "Could not load the preview.");
        setPayload(data);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load the preview.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, subscriptionId, initialData]);

  // ── Escape + focus trap ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Laisse le temps au panneau de monter avant de lui donner le focus.
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!nodes || nodes.length === 0) return;
      const list = Array.from(nodes);
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────

  const generate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setGenerateError(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    try {
      const res = await doFetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Generation failed.");
      setPayload(data);
      setSendOutcome("idle");
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setGenerating(false);
    }
  }, [doFetch, generating, subscriptionId]);

  const sendTest = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setSendOutcome("idle");
    setSendError(null);
    try {
      const res = await doFetch("/api/preview/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not send the test email.");
      setSendOutcome("success");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Could not send the test email.");
      setSendOutcome("error");
    } finally {
      setSending(false);
    }
  }, [doFetch, sending, subscriptionId]);

  if (!open) return null;

  const srcDoc = payload ? injectBaseTarget(payload.html) : undefined;
  const generationsLeft = payload?.generationsLeftToday ?? 0;
  const generateDisabled = generating || loading || generationsLeft <= 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {/*
            Deux niveaux plutôt qu'un : la bordure/le rayon/`overflow-hidden`
            vivent sur CE conteneur (`motion.div` externe), jamais sur le
            conteneur flex-col qui a l'iframe pour descendant. Chromium (repro
            hors-ligne, indépendant de React/Framer Motion) déborde du panneau
            quand ces deux responsabilités sont sur le MÊME élément. Le
            conteneur interne (role="dialog") reste un simple `flex flex-col`
            sans décoration propre.
          */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease }}
            className="glass h-[100dvh] w-full overflow-hidden rounded-none outline-none sm:h-[90vh] sm:w-[760px] sm:rounded-3xl"
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={`Preview of ${subscriptionName}`}
              tabIndex={-1}
              className="flex h-full flex-col outline-none"
            >
              {/* Header */}
              <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-6 py-4">
                <div className="min-w-0">
                  <p className="font-display truncate text-base font-semibold tracking-tight text-white">
                    {subscriptionName}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {payload?.source === "generated" && payload.createdAt
                      ? `Your edition, generated ${formatGeneratedAt(payload.createdAt)}`
                      : "Sample content"}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close preview"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-slate-400 transition-colors hover:border-accent/40 hover:text-white"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </header>

              {/* Body: iframe */}
              <div className="flex-1 overflow-hidden bg-slate-950/40 px-4 py-4 sm:px-6">
                {loading ? (
                  <div className="flex h-[75vh] items-center justify-center rounded-xl border border-white/10 bg-white/5">
                    <p className="text-sm text-slate-500">Loading preview...</p>
                  </div>
                ) : loadError ? (
                  <div className="flex h-[75vh] items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5">
                    <p className="max-w-sm text-center text-sm text-red-400">{loadError}</p>
                  </div>
                ) : (
                  <iframe
                    title={`Preview of ${subscriptionName}`}
                    srcDoc={srcDoc}
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    className="h-[75vh] w-full rounded-xl border border-white/10 bg-white"
                  />
                )}
              </div>

              {/* Footer: actions */}
              <footer className="space-y-3 border-t border-white/[0.06] px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <button
                      onClick={generate}
                      disabled={generateDisabled}
                      className="rounded-xl bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-4 py-2.5 font-display text-sm font-semibold text-slate-950 transition-all duration-300 hover:shadow-[0_0_24px_rgba(124,198,255,0.3)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {generating ? "Lia is writing your edition..." : "Generate my first edition"}
                    </button>
                    <p className="mt-2 text-xs text-slate-500">
                      {generating
                        ? `${elapsed}s elapsed`
                        : `Uses real articles from your sources. About a minute. ${generationsLeft} left today.`}
                    </p>
                    {generateError && <p className="mt-1 text-xs text-red-400">{generateError}</p>}
                  </div>

                  <div className="min-w-0 sm:text-right">
                    <button
                      onClick={sendTest}
                      disabled={!payload?.canSend || sending}
                      className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-accent/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {sending ? "Sending..." : "Send it to me"}
                    </button>
                    {sendOutcome === "success" && <p className="mt-2 text-xs text-emerald-300">Sent to you</p>}
                    {sendOutcome === "error" && sendError && <p className="mt-2 text-xs text-red-400">{sendError}</p>}
                  </div>
                </div>
              </footer>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
