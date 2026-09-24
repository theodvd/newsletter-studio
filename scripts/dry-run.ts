/**
 * Aperçu d'une VRAIE veille, sans envoi : charge la config depuis Supabase,
 * appelle le modèle avec la clé Anthropic locale, rend l'édition, mais ne
 * l'envoie jamais et n'écrit rien en base (`dryRun: true`).
 *
 * ATTENTION : ce script appelle un modèle payant et lit la base de
 * production. Il type-check (`tsc --noEmit`) mais n'est volontairement PAS
 * exécuté pendant l'implémentation de ce step.
 *
 * Usage : tsx scripts/dry-run.ts <subscriptionId>
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Parseur minimal de `.env.local` : une ligne `CLE=valeur` par variable, sans
 * dépendance externe. Les valeurs ne sont JAMAIS journalisées, seuls les noms
 * de clé peuvent apparaître dans les messages d'erreur.
 */
function loadEnvLocal(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnvLocal(path.resolve(__dirname, "../.env.local"));

  const subscriptionId = process.argv[2];
  if (!subscriptionId) {
    console.error("Usage : tsx scripts/dry-run.ts <subscriptionId> [classic|editorial]");
    process.exitCode = 1;
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY absente de .env.local : impossible d'appeler le modèle.");
    process.exitCode = 1;
    return;
  }

  // Import dynamique : après le chargement de .env.local, pour que le module
  // Supabase voie les variables d'environnement dès son initialisation.
  const { runSubscription } = await import("../src/lib/engine/run");

  const outcome = await runSubscription(subscriptionId, new Date(), {
    dryRun: true,
    credentials: { provider: "anthropic", apiKey: process.env.ANTHROPIC_API_KEY },
    // Deuxième argument facultatif : impose un template pour l'aperçu, utile
    // tant que la colonne `design` n'est pas en base ou pour comparer.
    designOverride: process.argv[3] ? { template: process.argv[3] } : undefined,
  });

  if (outcome.status !== "success" || !outcome.preview) {
    console.error(`Dry-run en échec (${outcome.status}) : ${outcome.reason || "raison inconnue"}`);
    process.exitCode = 1;
    return;
  }

  const outDir = path.resolve(__dirname, "../preview");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `dry-run-${subscriptionId}.html`);
  fs.writeFileSync(outPath, outcome.preview.html, "utf8");
  console.log(`Aperçu écrit : ${outPath} (${outcome.itemsSent ?? 0} articles cités)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
