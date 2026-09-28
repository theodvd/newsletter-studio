/**
 * Résolution de l'id de veille à utiliser pour `save_subscription_config` et
 * `set_design`, quand l'agent omet `subscription_id` dans son tool input.
 *
 * Bug corrigé (24/09) : quand Lia omettait `subscription_id` en éditant une
 * veille existante, `saveConfig` en créait une NOUVELLE au lieu de mettre à
 * jour celle en cours d'édition, faute de savoir laquelle mettre à jour.
 * La route connaît pourtant déjà cette veille : `knownSubscriptionId` (envoyé
 * par le client à l'ouverture de la conversation) et l'id mis à jour après un
 * save précédent dans le même tour.
 *
 * Fonction pure : ne fait aucun accès réseau. Elle ordonne les candidats du
 * plus fiable au moins fiable ; c'est l'appelant qui essaie chaque candidat
 * dans l'ordre (vérification de propriété comprise, exactement comme avant)
 * et s'arrête au premier qui appartient bien à l'utilisateur. Un tableau vide
 * signifie qu'il n'existe aucun candidat : à l'appelant de décider (création
 * d'un nouveau brouillon pour `save_subscription_config`, erreur pour
 * `set_design` qui ne crée jamais de veille).
 */
export type ResolveSubscriptionIdInput = {
  /** `subscription_id` explicitement fourni dans le tool input de l'agent. */
  inputId?: string | null;
  /** Id déjà connu côté serveur pour ce tour (client, ou save précédent du même tour). */
  knownId?: string | null;
};

export function resolveSubscriptionIdCandidates(input: ResolveSubscriptionIdInput): string[] {
  const inputId = (input.inputId ?? "").trim() || null;
  const knownId = (input.knownId ?? "").trim() || null;

  if (inputId && knownId && inputId !== knownId) {
    // Les deux sont fournis et diffèrent : on fait confiance à l'input en
    // premier (c'est la valeur la plus récente, explicitement donnée par
    // l'agent), mais on ne l'accepte que si la vérification de propriété
    // (faite par l'appelant) réussit. Si elle échoue, on retombe sur l'id
    // connu côté serveur plutôt que de créer un doublon ou d'échouer.
    return [inputId, knownId];
  }
  if (inputId) return [inputId];
  if (knownId) return [knownId];
  return [];
}
