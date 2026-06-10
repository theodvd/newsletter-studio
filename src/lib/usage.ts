import type { SupabaseClient } from "@supabase/supabase-js";
import { ENGINE_RUN_COST_USD } from "./pricing";

/**
 * Plafond de dépense API par utilisateur et par mois calendaire.
 * Dépense = conversations d'onboarding (usage_log, tokens réels)
 *         + livraisons du moteur (deliveries × coût moyen par exécution).
 * Les requêtes passent par le client RLS : elles ne voient que les
 * données de l'utilisateur connecté.
 */
export const MONTHLY_CAP_USD = 1.5;

const AVG_WEEKS_PER_MONTH = 4.33;

function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export async function monthlySpendUsd(supabase: SupabaseClient): Promise<number> {
  const since = monthStartIso();

  const [{ data: chatRows }, { count: deliveryCount }] = await Promise.all([
    supabase.from("usage_log").select("cost_usd").gte("created_at", since),
    supabase.from("deliveries").select("id", { count: "exact", head: true }).gte("sent_at", since),
  ]);

  const chatSpend = (chatRows ?? []).reduce((sum, r) => sum + Number(r.cost_usd || 0), 0);
  return chatSpend + (deliveryCount ?? 0) * ENGINE_RUN_COST_USD;
}

/** Coût mensuel projeté d'un ensemble de crons (pour bloquer au provisioning). */
export function projectedMonthlyCostUsd(crons: string[], runsPerWeekFn: (c: string) => number): number {
  return crons.reduce((sum, c) => sum + runsPerWeekFn(c) * AVG_WEEKS_PER_MONTH * ENGINE_RUN_COST_USD, 0);
}
