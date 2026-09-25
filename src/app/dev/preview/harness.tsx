"use client";

import { useState } from "react";
import { PreviewDialog } from "@/components/preview-dialog";
import type { PreviewPayload } from "@/lib/preview/payload";

/**
 * Client wrapper du harnais `/dev/preview` : `page.tsx` (serveur) construit le
 * HTML d'exemple et le passe ici en `initialPayload`, un JSON sérialisable.
 * Le faux fetch ci-dessous est ce qui rend le composant testable SANS réseau :
 * il simule `POST /api/preview` (génération, avec un court délai pour voir le
 * compteur de secondes) et `POST /api/preview/send`, sans jamais appeler
 * Supabase, un modèle ou Brevo.
 */
export function DevPreviewHarness({
  subscriptionName,
  initialPayload,
}: {
  subscriptionName: string;
  initialPayload: PreviewPayload;
}) {
  const [open, setOpen] = useState(true);

  const fakeFetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    await new Promise((resolve) => setTimeout(resolve, 600));

    if (url.includes("/api/preview/send")) {
      return new Response(JSON.stringify({ ok: true, sentTo: "you@example.com" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (init?.method === "POST") {
      const generated: PreviewPayload = {
        ...initialPayload,
        source: "generated",
        createdAt: new Date().toISOString(),
        canSend: true,
        generationsLeftToday: 0,
      };
      return new Response(JSON.stringify(generated), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(initialPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="aurora-blob aurora-a" aria-hidden />
      <div className="aurora-blob aurora-b" aria-hidden />
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-accent/40 hover:text-white"
        >
          Reopen preview
        </button>
      )}
      <PreviewDialog
        open={open}
        onClose={() => setOpen(false)}
        subscriptionId="dev-fixture"
        subscriptionName={subscriptionName}
        initialData={initialPayload}
        fetcher={fakeFetcher}
      />
    </main>
  );
}
