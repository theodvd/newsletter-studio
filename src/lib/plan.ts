/**
 * Limites de service.
 *
 * Il n'y a plus de plan payant. Le modèle est devenu : chacun branche sa
 * propre clé de fournisseur, ses éditions tournent dessus, et le projet ne
 * coûte rien à héberger. Un plan Pro n'aurait rien eu à vendre.
 *
 * Ce qui reste ici n'est donc pas commercial mais défensif : des bornes qui
 * protègent l'hébergeur et les sites sources. La seule dépense restant à la
 * charge de l'hébergeur est la conversation d'onboarding avec Lia, offerte
 * pour que l'on puisse essayer le produit avant de sortir une clé.
 */

export type Limits = {
  /** Veilles actives simultanées par utilisateur. */
  maxActiveDigests: number;
  /** Sources par veille : au-delà, le digest devient illisible et lent. */
  maxSources: number;
  /**
   * Plafonds de dépense HEBDOMADAIRES sur la clé de l'HÉBERGEUR, c'est-à-dire
   * l'onboarding uniquement (les éditions sont payées par l'utilisateur).
   *
   * Le plafond global est le garde-fou qui compte : les inscriptions étant
   * ouvertes et non plafonnées en nombre, c'est la seule borne entre une
   * vague de nouveaux comptes et une facture non bornée. Quand il est
   * atteint, l'onboarding est suspendu jusqu'au lundi suivant, et les
   * veilles déjà en route continuent puisqu'elles ne coûtent rien à
   * l'hébergeur.
   */
  weeklyCapUsdPerUser: number;
  weeklyCapUsdGlobal: number;
  /**
   * Aperçu (étape 2) : générations RÉELLES (dry-run payé par l'hébergeur)
   * autorisées par période glissante de 24h, par veille et par utilisateur.
   * Les admins (voir `src/lib/admin.ts`) ne comptent pas contre ces deux
   * bornes, mais restent soumis aux plafonds de dépense ci-dessus.
   */
  previewDailyPerSubscription: number;
  previewDailyPerUser: number;
  /** Envois de test (« Send it to me ») autorisés par édition d'aperçu stockée. */
  previewSendsPerPreview: number;
};

/** Lecture d'un nombre depuis l'environnement, avec valeur de repli. */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const LIMITS: Limits = {
  maxActiveDigests: envNumber("LIMIT_ACTIVE_DIGESTS", 3),
  maxSources: envNumber("LIMIT_SOURCES_PER_DIGEST", 12),
  weeklyCapUsdPerUser: envNumber("WEEKLY_CAP_USD_PER_USER", 1),
  weeklyCapUsdGlobal: envNumber("WEEKLY_CAP_USD_GLOBAL", 10),
  previewDailyPerSubscription: envNumber("PREVIEW_DAILY_PER_SUBSCRIPTION", 1),
  previewDailyPerUser: envNumber("PREVIEW_DAILY_PER_USER", 3),
  previewSendsPerPreview: envNumber("PREVIEW_SENDS_PER_PREVIEW", 3),
};
