/**
 * Un « tick » du moteur : repère les veilles dues et les exécute.
 * C'est l'unique point d'entrée planifié, appelé par /api/cron/tick.
 */

import { createAdminClient } from "@/lib/supabase/server";
import { isDue } from "./due";
import { loadActiveSubscriptions } from "./config";
import { runSubscription } from "./run";
import { purgeOldFlags } from "@/lib/abuse/report";
import type { RunOutcome } from "./types";

/** Les tentatives des 7 derniers jours suffisent à décider de ce qui est dû. */
const ATTEMPT_WINDOW_DAYS = 7;

/**
 * Dernière TENTATIVE d'envoi par veille, succès comme échec.
 *
 * On prend en compte les échecs volontairement : sinon une veille dont l'envoi
 * échoue serait relancée à chaque tick, ce qui consommerait la clé de
 * l'utilisateur en boucle. Une occurrence manquée se rattrape à la suivante.
 */
async function lastAttempts(): Promise<Map<string, Date>> {
  const db = createAdminClient();
  const since = new Date(Date.now() - ATTEMPT_WINDOW_DAYS * 86400000).toISOString();
  const { data, error } = await db
    .from("deliveries")
    .select("subscription_id, sent_at")
    .gte("sent_at", since)
    .order("sent_at", { ascending: false });

  if (error) throw new Error(`Lecture des envois récents impossible : ${error.message}`);

  const map = new Map<string, Date>();
  for (const row of data ?? []) {
    if (!map.has(row.subscription_id)) {
      map.set(row.subscription_id, new Date(row.sent_at));
    }
  }
  return map;
}

export type TickReport = {
  checked: number;
  due: number;
  outcomes: RunOutcome[];
};

/**
 * Éditions par lot du tick : les éditions editorial sont plus longues à
 * générer (deep dive compris), un enchaînement strictement séquentiel
 * risquerait de dépasser le budget de 280 s du cron sur un tick chargé.
 */
const TICK_CONCURRENCY = 3;

/**
 * Exécute `worker` sur chaque élément de `items`, au plus `limit` en même
 * temps, en renvoyant les résultats DANS L'ORDRE d'origine (contrairement à
 * `Promise.all` sur des promesses démarrées en rafale, ici le lancement est
 * étalé : au plus `limit` exécutions en vol à tout instant).
 */
async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }

  const lanes = Array.from({ length: Math.min(limit, items.length) }, () => runNext());
  await Promise.all(lanes);
  return results;
}

/** Exécute toutes les veilles dues, avec une concurrence limitée (voir `TICK_CONCURRENCY`). */
export async function runTick(now: Date = new Date()): Promise<TickReport> {
  const [subscriptions, attempts] = await Promise.all([loadActiveSubscriptions(), lastAttempts()]);

  const dueIds: string[] = [];
  for (const sub of subscriptions) {
    const { due } = isDue({
      cron: sub.frequency_cron,
      now,
      lastSentAt: attempts.get(sub.id) ?? null,
    });
    if (due) dueIds.push(sub.id);
  }

  // Entretien quotidien : purge des conversations signalées expirées. Une fois
  // par jour suffit, et le tick est le seul rendez-vous régulier du serveur.
  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 5) {
    const purged = await purgeOldFlags();
    if (purged > 0) console.log(`[engine] purge : ${purged} conversation(s) signalée(s) expirée(s)`);
  }

  const outcomes = await mapWithConcurrency(dueIds, TICK_CONCURRENCY, async (id): Promise<RunOutcome> => {
    try {
      return await runSubscription(id, now);
    } catch (e) {
      // Filet de sécurité : runSubscription ne doit jamais lever, mais un tick
      // ne doit surtout pas s'arrêter sur une veille.
      return { subscriptionId: id, status: "error", reason: e instanceof Error ? e.message : "erreur inattendue" };
    }
  });

  return { checked: subscriptions.length, due: dueIds.length, outcomes };
}
