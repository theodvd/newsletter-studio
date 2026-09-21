/**
 * Qui a le droit d'administrer cette instance.
 *
 * Liste d'adresses dans `ADMIN_EMAILS`, séparées par des virgules. Pas de
 * colonne « is_admin » en base : elle serait une cible de plus à verrouiller,
 * alors que le droit d'administrer appartient à celui qui exploite le serveur,
 * pas à une ligne de la base. Variable vide, donc aucun administrateur : une
 * instance fraîchement installée n'expose rien par défaut.
 */

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = adminEmails();
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}
