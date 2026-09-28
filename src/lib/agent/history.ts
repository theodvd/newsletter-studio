/**
 * Historique de conversation opt-in (voir `profiles.keep_history` et
 * `0009_history.sql`) : deux fonctions pures, sans accès réseau ni base.
 *
 *  - `filterVisibleMessages` : ce qui a le droit d'être ENREGISTRÉ. Seuls les
 *    tours utilisateur et assistant, en texte, jamais les blocs internes
 *    (tool_use / tool_result) qui ne font pas partie de ce qui a été montré
 *    à l'écran.
 *  - `capConversationHistory` : ce qui a le droit d'être ENVOYÉ AU MODÈLE.
 *    Reprendre une longue conversation sauvegardée ne doit pas faire exploser
 *    le coût de chaque tour suivant : on ne renvoie que les derniers messages.
 */

export type StoredMessage = { role: "user" | "assistant"; content: string };

/**
 * Filtre une liste de messages bruts vers ce qui doit être stocké : rôle
 * user/assistant uniquement, contenu textuel non vide uniquement. Un message
 * dont le contenu n'est pas une chaîne (tool_use, tool_result, contenu
 * multi-blocs) est écarté plutôt que converti, pour ne jamais faire fuiter un
 * payload interne dans l'historique relu par l'utilisateur.
 */
export function filterVisibleMessages(messages: Array<{ role: string; content: unknown }>): StoredMessage[] {
  const out: StoredMessage[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content !== "string") continue;
    if (!m.content.trim()) continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/** Nombre maximum de messages envoyés au modèle, historique repris compris. */
export const MAX_HISTORY_MESSAGES = 40;

/**
 * Ne garde que les `max` derniers messages d'une conversation avant de
 * l'envoyer au modèle. Une conversation plus courte que `max` traverse
 * inchangée. Les messages les plus récents (le tour en cours) sont toujours
 * dans la partie conservée, puisqu'ils sont en fin de tableau.
 */
export function capConversationHistory<T>(messages: T[], max: number = MAX_HISTORY_MESSAGES): T[] {
  if (!Array.isArray(messages) || messages.length <= max) return messages;
  return messages.slice(messages.length - max);
}
