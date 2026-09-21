import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runTick } from "@/lib/engine/tick";

/**
 * Déclencheur du moteur de veille.
 * Appelé par un cron système (voir ADMIN.md) :
 *   * /5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/tick
 *
 * Remplace les workflows planifiés n8n : plus de workflow par utilisateur,
 * plus de clé d'API n8n, plus de provisioning à maintenir.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Comparaison à temps constant, pour ne pas exposer le secret par la durée. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET non configuré côté serveur." }, { status: 503 });
  }

  const header = request.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !secretMatches(provided, expected)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const report = await runTick();
    console.log(
      `[engine] tick : ${report.checked} veilles actives, ${report.due} dues, ` +
        report.outcomes.map((o) => `${o.subscriptionId.slice(0, 8)}=${o.status}`).join(" ")
    );
    return NextResponse.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : "erreur inattendue";
    console.error("[engine] tick en échec :", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET accepté aussi : certains ordonnanceurs ne savent faire que ça. */
export const GET = POST;
