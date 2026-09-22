"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Widget Cloudflare Turnstile.
 *
 * Pourquoi : l'inscription est ouverte, et elle a été farmée tout l'été par des
 * bots (9 comptes sur 22 en août 2026, tous avec des adresses en « point Gmail »).
 * Turnstile est invisible pour un humain dans la quasi-totalité des cas, ce qui
 * évite de punir les vrais utilisateurs pour arrêter les robots.
 *
 * Sans `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, le composant ne rend rien et renvoie un
 * jeton nul : l'application reste utilisable en développement et chez un
 * auto-hébergeur qui n'en veut pas. Le captcha n'est réellement EXIGÉ que si
 * Supabase est configuré pour, côté serveur.
 */

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    onTurnstileReady?: () => void;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileReady";

/** Charge le script une seule fois, même si plusieurs widgets le demandent. */
function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.turnstile) return resolve();

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("load error")), { once: true });
      return;
    }

    window.onTurnstileReady = () => resolve();
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("load error"));
    document.head.appendChild(script);
  });
}

type Props = {
  /** Appelé avec le jeton, ou null quand il expire ou échoue. */
  onToken: (token: string | null) => void;
  /** Incrémenter cette valeur réinitialise le widget (un jeton ne sert qu'une fois). */
  resetSignal?: number;
};

export function Turnstile({ onToken, resetSignal = 0 }: Props) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const container = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [failed, setFailed] = useState(false);

  // Garde la dernière callback sans relancer le rendu du widget.
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: siteKey,
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => {
            onTokenRef.current(null);
            setFailed(true);
          },
          theme: "dark",
          appearance: "interaction-only",
        });
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          // le widget a déjà disparu avec le DOM
        }
      }
    };
  }, [siteKey]);

  // Un jeton Turnstile est à usage unique : après un envoi, il faut en regénérer un.
  useEffect(() => {
    if (resetSignal > 0 && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      onTokenRef.current(null);
    }
  }, [resetSignal]);

  if (!siteKey) return null;

  return (
    <div className="mt-3">
      <div ref={container} />
      {failed && (
        <p className="mt-2 text-xs text-amber-400">
          The anti-bot check could not load. Disable your content blocker for this page, or try
          another browser.
        </p>
      )}
    </div>
  );
}
