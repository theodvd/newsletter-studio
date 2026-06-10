"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";

// Scène Three.js chargée côté client uniquement (code-splittée par page)
const IceScene = dynamic(() => import("@/components/ice-scene"), { ssr: false });

/**
 * Cristal 3D en arrière-plan plein écran, avec fondu d'apparition.
 * Utilisable depuis les Server Components (login, accueil).
 */
export function CrystalBackdrop({ align = "center" }: { align?: "center" | "right" }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 2, delay: 0.3 }}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden
    >
      <IceScene align={align} />
    </motion.div>
  );
}
