"use client";

import { Component, type ReactNode, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { canUseWebGL } from "@/lib/webgl";

// Scène Three.js chargée côté client uniquement (code-splittée par page)
const IceScene = dynamic(() => import("@/components/ice-scene"), { ssr: false });

/**
 * Garde-fou : si la scène 3D plante malgré la détection (contexte perdu,
 * shader refusé par le pilote), on retire le cristal au lieu de faire tomber
 * toute la page.
 */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Cristal 3D en arrière-plan plein écran, avec fondu d'apparition.
 * Utilisable depuis les Server Components (login, accueil).
 * Sans WebGL2, la scène n'est pas montée : la page reste intacte, sans cristal.
 */
export function CrystalBackdrop({ align = "center" }: { align?: "center" | "right" }) {
  // Détection après montage : le rendu serveur et le premier rendu client restent identiques
  const [webgl, setWebgl] = useState(false);
  useEffect(() => setWebgl(canUseWebGL()), []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 2, delay: 0.3 }}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden
    >
      {webgl && (
        <SceneBoundary>
          <IceScene align={align} />
        </SceneBoundary>
      )}
    </motion.div>
  );
}
