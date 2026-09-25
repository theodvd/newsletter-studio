/**
 * Verrou « une génération à la fois par utilisateur ».
 *
 * Les quotas quotidiens se comptent en base APRÈS la génération : sans ce
 * verrou, vingt requêtes lancées en même temps verraient toutes « 0
 * génération aujourd'hui » et passeraient, chacune aux frais de la clé de
 * l'hébergeur. Le verrou ferme cette fenêtre.
 *
 * Il vit en mémoire du processus : suffisant tant que l'app tourne dans un
 * seul conteneur, ce qui est le cas. Avec plusieurs instances, il faudrait
 * le déplacer en base (ligne de réservation insérée avant la génération).
 */
const inFlight = new Set<string>();

/** Réserve le créneau de l'utilisateur. `false` si une génération tourne déjà. */
export function tryAcquire(userId: string): boolean {
  if (inFlight.has(userId)) return false;
  inFlight.add(userId);
  return true;
}

/** Libère le créneau, à appeler dans un `finally`. */
export function release(userId: string): void {
  inFlight.delete(userId);
}
