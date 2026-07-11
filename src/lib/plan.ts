import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Plans Free / Pro.
 * Axe de monétisation : fréquence de livraison + profondeur d'analyse
 * (pas le nombre de veilles, personne ne veut 10 newsletters).
 *
 * Free : 1 veille active, au choix hebdomadaire (jusqu'à 8 sources)
 *        ou quotidienne limitée (1 envoi/jour, jusqu'à 5 sources).
 * Pro  : jusqu'à 3 veilles, jusqu'à 2 envois/jour, 12 sources,
 *        analyse approfondie, plafond d'usage relevé.
 */

export type Plan = "free" | "pro";

export type PlanLimits = {
  label: string;
  maxActiveDigests: number;
  /** Envois max par semaine (7 = 1/jour, 14 = 2/jour) */
  maxRunsPerWeek: number;
  /** Sources max pour une veille quotidienne */
  maxSourcesDaily: number;
  /** Sources max pour une veille hebdo/bi-hebdo */
  maxSourcesWeekly: number;
  /** Plafond de dépense API par mois calendaire (USD) */
  monthlyCapUsd: number;
  /** Profondeur des résumés produits par le moteur */
  depth: "standard" | "deep";
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    label: "Free",
    maxActiveDigests: 1,
    maxRunsPerWeek: 7,
    maxSourcesDaily: 5,
    maxSourcesWeekly: 8,
    monthlyCapUsd: 1.5,
    depth: "standard",
  },
  pro: {
    label: "Pro",
    maxActiveDigests: 3,
    maxRunsPerWeek: 14,
    maxSourcesDaily: 12,
    maxSourcesWeekly: 12,
    monthlyCapUsd: 10,
    depth: "deep",
  },
};

/** Prix affichés (la facturation Stripe viendra plus tard). */
export const PRO_PRICE_MONTHLY_EUR = 9;
export const PRO_PRICE_YEARLY_EUR = 79;

/** Une veille est "quotidienne" si elle part au moins 5 fois par semaine. */
export function isDailyCadence(runsPerWeek: number): boolean {
  return runsPerWeek >= 5;
}

/** Sources max autorisées pour un plan selon la cadence. */
export function maxSourcesFor(limits: PlanLimits, runsPerWeek: number): number {
  return isDailyCadence(runsPerWeek) ? limits.maxSourcesDaily : limits.maxSourcesWeekly;
}

/**
 * Lit le plan de l'utilisateur connecté (profiles.plan, RLS).
 * Retombe sur "free" si la colonne ou la ligne manque (déploiement progressif).
 */
export async function getUserPlan(supabase: SupabaseClient): Promise<Plan> {
  try {
    const { data } = await supabase.from("profiles").select("plan").maybeSingle();
    return data?.plan === "pro" ? "pro" : "free";
  } catch {
    return "free";
  }
}
