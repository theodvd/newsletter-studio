/**
 * Petits utilitaires de couleur pour le template editorial : dériver un fond
 * teinté de l'accent choisi (encadrés, callouts) et décider quel texte reste
 * lisible dessus, sans dépendre d'une palette figée.
 */

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function toHex(n: number): string {
  return Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, "0");
}

/** Éclaircit `hex` en le mélangeant avec du blanc (`ratio` : proportion de blanc, 0 à 1). */
export function tint(hex: string, ratio: number): string {
  const [r, g, b] = parseHex(hex);
  const t = Math.min(1, Math.max(0, ratio));
  const mix = (c: number) => c + (255 - c) * t;
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Luminance relative (WCAG) d'une couleur, pour juger du contraste d'un texte dessus. */
function relativeLuminance(hex: string): number {
  const channels = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Texte blanc ou encre foncée : celui des deux qui contraste le mieux sur `hex`. */
export function readableOn(hex: string): string {
  return relativeLuminance(hex) > 0.5 ? "#1C1917" : "#ffffff";
}
