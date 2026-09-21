import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/server";
import { LIMITS } from "./plan";

/**
 * Dépense hebdomadaire sur la clé de l'HÉBERGEUR.
 *
 * Depuis le passage au BYOK, les éditions tournent sur la clé de chaque
 * utilisateur : elles ne sont plus comptées ici. Seule reste la conversation
 * d'onboarding avec Lia, offerte, et qu'il faut donc borner.
 *
 * Deux bornes, et la seconde est la plus importante :
 *  - par utilisateur : empêche un compte de monopoliser la clé
 *  - GLOBALE : sans elle, ouvrir les inscriptions revient à signer un chèque
 *    en blanc, puisque le nombre de comptes n'est plus limité
 *
 * La lecture par utilisateur passe par le client à session (RLS). La lecture
 * globale exige la clé service : un utilisateur ne doit pas voir la dépense
 * des autres. L'écriture est réservée au serveur (migration 0003), sans quoi
 * une ligne à coût négatif annulerait les deux plafonds.
 */

/** Début de la semaine courante (lundi 00:00 UTC). */
export function weekStartIso(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayFromMonday = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - dayFromMonday);
  return d.toISOString();
}

function sum(rows: Array<{ cost_usd: number | string | null }> | null): number {
  const total = (rows ?? []).reduce((acc, r) => acc + Number(r.cost_usd || 0), 0);
  // Plancher à zéro : ceinture et bretelles avec la contrainte CHECK en base.
  return Math.max(0, total);
}

/** Dépense de l'utilisateur connecté, cette semaine. */
export async function userWeeklySpendUsd(supabase: SupabaseClient, now: Date = new Date()): Promise<number> {
  const { data } = await supabase
    .from("usage_log")
    .select("cost_usd")
    .gte("created_at", weekStartIso(now));
  return sum(data);
}

/** Dépense de TOUS les utilisateurs, cette semaine. Exige la clé service. */
export async function globalWeeklySpendUsd(now: Date = new Date()): Promise<number> {
  const { data } = await createAdminClient()
    .from("usage_log")
    .select("cost_usd")
    .gte("created_at", weekStartIso(now));
  return sum(data);
}

export type SpendVerdict =
  | { allowed: true; userSpend: number; globalSpend: number }
  | { allowed: false; reason: string; scope: "user" | "global" };

/**
 * Vérifie les deux plafonds avant tout appel au modèle sur la clé de
 * l'hébergeur. À appeler AVANT de dépenser, jamais après.
 */
export async function checkSpendAllowed(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<SpendVerdict> {
  const [userSpend, globalSpend] = await Promise.all([
    userWeeklySpendUsd(supabase, now),
    globalWeeklySpendUsd(now),
  ]);

  if (globalSpend >= LIMITS.weeklyCapUsdGlobal) {
    return {
      allowed: false,
      scope: "global",
      reason:
        "Assisted setup is paused until next week: this instance hit its weekly budget. " +
        "Your running digests are unaffected, they use your own API key.",
    };
  }

  if (userSpend >= LIMITS.weeklyCapUsdPerUser) {
    return {
      allowed: false,
      scope: "user",
      reason:
        `You've used this week's setup allowance ($${LIMITS.weeklyCapUsdPerUser.toFixed(2)}). ` +
        "It resets on Monday, and your running digests are unaffected: they use your own API key.",
    };
  }

  return { allowed: true, userSpend, globalSpend };
}
