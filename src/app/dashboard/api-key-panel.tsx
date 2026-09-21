"use client";

import { useState } from "react";

/**
 * Panneau de connexion de la clé du fournisseur (BYOK).
 *
 * Le principe assumé : vos éditions tournent sur VOTRE clé. Personne ne paie
 * pour vous, personne ne vous facture. La clé est chiffrée côté serveur et
 * n'est jamais renvoyée au navigateur, d'où l'affichage d'un simple indice.
 */

type Props = {
  provider: string | null;
  hint: string | null;
};

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic (Claude)", placeholder: "sk-ant-...", console: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "OpenAI (GPT)", placeholder: "sk-...", console: "https://platform.openai.com/api-keys" },
];

export function ApiKeyPanel({ provider, hint }: Props) {
  const [connected, setConnected] = useState(Boolean(provider && hint));
  const [currentProvider, setCurrentProvider] = useState(provider || "anthropic");
  const [currentHint, setCurrentHint] = useState(hint);
  const [selected, setSelected] = useState(provider || "anthropic");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meta = PROVIDERS.find((p) => p.id === selected) ?? PROVIDERS[0];
  const connectedMeta = PROVIDERS.find((p) => p.id === currentProvider);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/llm-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selected, apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the key.");
      setConnected(true);
      setCurrentProvider(data.provider);
      setCurrentHint(data.hint);
      setApiKey("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the key.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/llm-key", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove the key.");
      setConnected(false);
      setCurrentHint(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the key.");
    } finally {
      setBusy(false);
    }
  }

  if (connected) {
    return (
      <div className="glass mt-6 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-sm font-medium text-white">
              {connectedMeta?.label ?? currentProvider} connected
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Key ending in <span className="font-mono text-slate-400">{currentHint}</span>. Your
              digests run on your own key, so they cost you what your provider charges and nothing
              more.
            </p>
          </div>
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-50"
          >
            {busy ? "Removing..." : "Remove"}
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="glass mt-6 rounded-2xl border border-accent/20 p-5">
      <p className="font-display text-sm font-medium text-white">Connect your API key</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Editions are written by the model you choose, using your own key. Nothing runs until you add
        one, and you can remove it at any time.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={
              "rounded-lg px-3 py-1.5 text-xs transition-colors " +
              (selected === p.id
                ? "bg-accent/15 text-accent"
                : "border border-white/10 text-slate-400 hover:text-slate-200")
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={meta.placeholder}
          autoComplete="off"
          spellCheck={false}
          className="min-w-[16rem] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm text-white placeholder:text-slate-600 focus:border-accent/40 focus:outline-none"
        />
        <button
          onClick={save}
          disabled={busy || apiKey.trim().length < 20}
          className="rounded-lg bg-gradient-to-r from-sky-400/90 to-cyan-300/90 px-4 py-2 font-display text-sm font-semibold text-slate-950 transition-opacity disabled:opacity-40"
        >
          {busy ? "Checking..." : "Connect"}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-slate-600">
        Get a key from{" "}
        <a href={meta.console} target="_blank" rel="noreferrer" className="text-accent/80 underline">
          {meta.label}
        </a>
        . It is encrypted before storage and never sent back to your browser.
      </p>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
