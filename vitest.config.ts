import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Config vitest minimale : le seul réglage qui compte ici est l'alias `@`
 * (utilisé partout dans `src/` pour les imports absolus), pour que les tests
 * résolvent les mêmes chemins que Next.js.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
