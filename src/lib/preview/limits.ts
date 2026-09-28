/**
 * Décision pure : l'utilisateur a-t-il le droit de lancer une génération
 * réelle d'aperçu MAINTENANT ? Séparée de la route API pour être testée sans
 * base de données ni horloge : on lui passe des compteurs déjà agrégés
 * (dernières 24h), elle ne fait qu'appliquer les bornes de `src/lib/plan.ts`.
 *
 * Ne couvre PAS les plafonds de dépense hebdomadaires (`checkSpendAllowed`,
 * `src/lib/usage.ts`) : ce sont deux garde-fous indépendants, vérifiés l'un
 * après l'autre par la route `POST /api/preview`.
 */

export type PreviewGenerationLimits = {
  previewDailyPerSubscription: number;
  previewDailyPerUser: number;
};

export type GenerationCounts = {
  /** Générations réelles de CETTE veille dans les dernières 24h. */
  countSubscription24h: number;
  /** Générations réelles de TOUTES les veilles de cet utilisateur dans les dernières 24h. */
  countUser24h: number;
  /**
   * Un administrateur (`src/lib/admin.ts`) contourne ces deux compteurs
   * quotidiens, mais pas les plafonds de dépense sur la clé de l'hébergeur.
   */
  isAdmin: boolean;
};

export type GenerateVerdict = { allowed: true } | { allowed: false; reason: string };

/** Peut-on lancer une génération réelle maintenant, pour cette veille et cet utilisateur ? */
export function canGenerate(counts: GenerationCounts, limits: PreviewGenerationLimits): GenerateVerdict {
  if (counts.isAdmin) return { allowed: true };

  if (counts.countSubscription24h >= limits.previewDailyPerSubscription) {
    return {
      allowed: false,
      reason:
        limits.previewDailyPerSubscription <= 1
          ? "You've already generated a preview for this digest today. Try again tomorrow."
          : `You've reached today's limit for this digest (${limits.previewDailyPerSubscription} generations/day). Try again tomorrow.`,
    };
  }

  if (counts.countUser24h >= limits.previewDailyPerUser) {
    return {
      allowed: false,
      reason: `You've reached today's preview limit across all your digests (${limits.previewDailyPerUser}/day). Try again tomorrow.`,
    };
  }

  return { allowed: true };
}

/**
 * Générations restantes aujourd'hui, purement informatif (affiché dans le
 * dialogue d'aperçu). Volontairement calculé de la même façon pour tout le
 * monde, admin compris : seul `canGenerate` bascule le contournement pour un
 * admin, ce nombre reste un repère honnête plutôt qu'un « illimité » abstrait.
 */
export function generationsLeftToday(counts: GenerationCounts, limits: PreviewGenerationLimits): number {
  const perSubscription = limits.previewDailyPerSubscription - counts.countSubscription24h;
  const perUser = limits.previewDailyPerUser - counts.countUser24h;
  return Math.max(0, Math.min(perSubscription, perUser));
}
