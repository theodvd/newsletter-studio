/**
 * Décodage minimal des entités HTML échappées à tort dans un texte destiné à
 * être stocké en base (nom de veille, ton, titre d'en-tête).
 *
 * Contexte : le modèle écrit parfois l'entité littérale au lieu du caractère
 * (ex. « React Native &amp; AI Dev Weekly » au lieu de « React Native & AI Dev
 * Weekly »), parce que son tool input est lui-même transporté en JSON et que
 * rien ne l'empêche d'imiter un échappement HTML appris ailleurs. On décode
 * donc AVANT stockage, une seule fois (pas de boucle récursive : une entité
 * produite par ce décodage n'est jamais redécodée, exactement le comportement
 * d'un navigateur).
 *
 * Couvre les 5 entités nommées les plus courantes et toute entité numérique
 * (décimale `&#39;` ou hexadécimale `&#x27;`). Tout le reste (texte sans
 * entité, entité inconnue) traverse inchangé.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const ENTITY_PATTERN = /&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g;

export function decodeHtmlEntities(input: string): string {
  if (typeof input !== "string" || !input.includes("&")) return input;

  return input.replace(ENTITY_PATTERN, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const codePoint = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      if (!Number.isFinite(codePoint)) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}
