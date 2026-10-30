/**
 * Détecte si le navigateur peut créer un contexte WebGL2.
 *
 * Contexte : sans WebGL (accélération matérielle coupée, navigateur sans
 * fenêtre, poste d'entreprise verrouillé, vieux GPU), three.js lève
 * « Error creating WebGL context » au montage du Canvas, et l'erreur remonte
 * jusqu'à la racine React : toute la page tombe sur « Application error ».
 * On teste donc AVANT de monter la scène 3D.
 *
 * WebGL2 uniquement : three.js r163+ a abandonné WebGL1, un navigateur qui ne
 * propose que WebGL1 plante de la même façon.
 *
 * `createCanvas` est injectable pour les tests ; par défaut, un canvas du DOM.
 * Côté serveur (pas de `document`), l'appel lève et on renvoie `false`.
 */
export function canUseWebGL(
  createCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")
): boolean {
  try {
    const gl = createCanvas().getContext("webgl2");
    if (!gl) return false;
    // Libère le contexte de test : le navigateur limite le nombre de contextes actifs
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
