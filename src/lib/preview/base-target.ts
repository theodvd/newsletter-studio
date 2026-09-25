/**
 * Injecte `<base target="_blank">` dans le `<head>` d'un document HTML.
 *
 * L'aperçu s'affiche dans un `<iframe srcDoc>` sandboxé SANS `allow-scripts`
 * ni `allow-same-origin` (voir `preview-dialog.tsx`) : un clic sur un lien de
 * l'édition tenterait sinon de naviguer l'iframe elle-même, ce que le sandbox
 * bloque silencieusement. `<base target="_blank">` fait ouvrir ces liens dans
 * un nouvel onglet, seul comportement autorisé par `allow-popups`.
 */
export function injectBaseTarget(html: string): string {
  const BASE_TAG = '<base target="_blank">';

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${BASE_TAG}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${BASE_TAG}</head>`);
  }
  // Pas de structure HTML reconnaissable : on préfixe, au pire ce sera ignoré
  // par le navigateur plutôt que de faire échouer l'aperçu.
  return `<head>${BASE_TAG}</head>${html}`;
}
