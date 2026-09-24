/**
 * Estimation des coûts API (Claude Sonnet 4.6 : 3 $/M tokens input, 15 $/M output).
 * Sert à afficher le coût de la conversation d'onboarding et une estimation
 * du coût récurrent de la veille selon sa fréquence cron et son template.
 */

import { expectedOutputTokensForSections } from "@/lib/templates/editorial";
import type { Design } from "@/lib/templates/types";

export const SONNET_INPUT_PER_TOKEN = 3 / 1_000_000;
export const SONNET_OUTPUT_PER_TOKEN = 15 / 1_000_000;

// Moyennes observées sur les exécutions réelles du moteur
// (prompt avec articles agrégés ~8k tokens, digest généré ~1.5k tokens)
const ENGINE_RUN_INPUT_TOKENS = 8_000;
const ENGINE_RUN_OUTPUT_TOKENS = 1_500;

export function costUsd(inputTokens: number, outputTokens: number): number {
  return inputTokens * SONNET_INPUT_PER_TOKEN + outputTokens * SONNET_OUTPUT_PER_TOKEN;
}

export const ENGINE_RUN_COST_USD = costUsd(ENGINE_RUN_INPUT_TOKENS, ENGINE_RUN_OUTPUT_TOKENS);

// L'editorial agrège plus d'articles (5 sections potentielles) et produit un
// deep dive : le prompt pèse davantage en entrée qu'avec le classic.
const EDITORIAL_RUN_INPUT_TOKENS = 9_000;
/**
 * Estimation du coût d'une exécution du moteur, selon le template choisi.
 * Le classic garde exactement l'estimation d'avant les templates (8k in /
 * 1,5k out) ; l'editorial part de la longueur ATTENDUE de ses sections
 * actives, pas de son plafond de sortie, qui n'est qu'un garde-fou.
 */
export function estimateRunCostUsd(design: Design): number {
  if (design.template === "editorial") {
    return costUsd(EDITORIAL_RUN_INPUT_TOKENS, expectedOutputTokensForSections(design.sections));
  }
  return ENGINE_RUN_COST_USD;
}

/** Nombre d'exécutions par semaine déduit d'un cron 5 champs. */
export function runsPerWeek(cron: string): number {
  const parts = String(cron || "").trim().split(/\s+/);
  if (parts.length < 5) return 7;
  const hours = parts[1];
  const dow = parts[4];

  const runsPerDay = hours.split(",").length;

  let daysPerWeek = 7;
  if (dow !== "*") {
    daysPerWeek = dow.split(",").reduce((acc, part) => {
      const range = part.match(/^(\d+)-(\d+)$/);
      if (range) return acc + (parseInt(range[2]) - parseInt(range[1]) + 1);
      return acc + 1;
    }, 0);
  }
  return Math.max(1, runsPerDay * daysPerWeek);
}

export function formatUsd(amount: number): string {
  if (amount < 0.01) return "<$0.01";
  return `$${amount.toFixed(2)}`;
}
