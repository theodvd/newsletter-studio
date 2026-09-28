import { notFound } from "next/navigation";
import { DevConsentHarness } from "./harness";

/**
 * Harnais de QA visuelle pour la carte de consentement d'historique et le
 * bloc dashboard associé, HORS PRODUCTION uniquement : voir
 * `src/app/dev/preview/page.tsx` pour le même principe. Le middleware ne rend
 * `/dev` public que quand `NODE_ENV !== "production"` (voir middleware.ts) :
 * ce `notFound()` est la deuxième barrière, au cas où la page serait quand
 * même atteinte.
 */
export default function DevConsentPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevConsentHarness />;
}
