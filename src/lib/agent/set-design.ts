/**
 * Fusion de l'input du tool `set_design` avec le design ACTUEL d'une veille,
 * avant re-sanitisation complète par `resolveDesign`.
 *
 * Tous les champs de `set_design` sont optionnels : Lia ne renvoie que ce qui
 * change (« mets un accent bleu marine » ne doit pas réinitialiser le
 * template ni les sections). On part donc du design déjà résolu de la veille,
 * on écrase uniquement les clés explicitement fournies (un champ omis, càd
 * `undefined`, ne touche pas au design actuel ; `title: null` est une valeur
 * EXPLICITE qui réinitialise le titre, pas une omission), puis on repasse le
 * tout par `resolveDesign` : c'est cette seconde passe qui sanitise
 * réellement (couleur invalide -> défaut, sections inconnues filtrées...).
 * Aucun champ n'est donc jamais stocké sans être passé par `resolveDesign`.
 *
 * Fonction pure : aucun accès réseau ni base de données, testable seule.
 */

import { resolveDesign } from "@/lib/templates/design";
import type { Design } from "@/lib/templates/types";

export type SetDesignInput = {
  subscription_id?: string;
  template?: string;
  accent?: string;
  /** `undefined` : champ omis, ne change rien. `null` : réinitialise explicitement au nom de la veille. */
  title?: string | null;
  sections?: string[];
  images?: boolean;
};

export function mergeDesignInput(current: Design, input: SetDesignInput, frequencyCron: string): Design {
  const patch: Record<string, unknown> = { ...current };

  if (input.template !== undefined) patch.template = input.template;
  if (input.accent !== undefined) patch.accent = input.accent;
  if (input.title !== undefined) patch.title = input.title;
  if (input.sections !== undefined) patch.sections = input.sections;
  if (input.images !== undefined) patch.images = input.images;

  return resolveDesign(patch, frequencyCron);
}
