/**
 * Chargement de la configuration d'une veille et journalisation des envois.
 * Porté depuis les nœuds n8n « Charger la config », « Logger la delivery » et
 * « Logger les items envoyés ».
 */

import { createAdminClient } from "@/lib/supabase/server";
import { allItems } from "@/lib/templates";
import type { Edition } from "@/lib/templates/types";
import { normalizeUrl } from "./parse";
import type { Article, SubscriptionConfig } from "./types";

/** Nombre d'entrées d'historique chargées pour la déduplication. */
const DEDUP_HISTORY_SIZE = 800;

const SELECT =
  "*,sources(*),delivered_items(url,url_hash,title_key)," +
  "profiles(email,full_name,job_role,llm_provider,llm_key_encrypted)";

/** Charge une veille avec ses sources, son historique et le profil de son propriétaire. */
export async function loadConfig(subscriptionId: string): Promise<SubscriptionConfig> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("subscriptions")
    .select(SELECT)
    .eq("id", subscriptionId)
    .order("delivered_at", { referencedTable: "delivered_items", ascending: false })
    .limit(DEDUP_HISTORY_SIZE, { referencedTable: "delivered_items" })
    .maybeSingle();

  if (error) throw new Error(`Chargement de la config impossible : ${error.message}`);
  if (!data) throw new Error(`Veille introuvable : ${subscriptionId}`);
  return data as unknown as SubscriptionConfig;
}

/** Les veilles actives, pour que le tick détermine lesquelles sont dues. */
export async function loadActiveSubscriptions(): Promise<
  Array<{ id: string; frequency_cron: string }>
> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("subscriptions")
    .select("id, frequency_cron")
    .eq("status", "active");

  if (error) throw new Error(`Liste des veilles actives impossible : ${error.message}`);
  return data ?? [];
}

/**
 * Enregistre l'édition et, seulement si l'envoi a réussi, les articles envoyés.
 *
 * Le point capital est là : marquer les articles comme envoyés alors que
 * l'envoi a échoué les brûle définitivement, puisque la déduplication les
 * écartera ensuite. C'est exactement ce qui a fait perdre 108 articles sur une
 * veille Slack tombée en août 2026.
 */
export async function logDelivery(params: {
  subscriptionId: string;
  status: "success" | "error";
  error?: string | null;
  edition: Edition | null;
  articles: Article[];
}): Promise<void> {
  const db = createAdminClient();

  // Aplati : tous les articles cités, toutes sections et tous templates
  // confondus (voir `allItems`), pour ne pas coupler ce log à la forme
  // (`items` vs `radar`/`deep_dive`/...) d'un template en particulier.
  const items = params.edition ? allItems(params.edition) : [];

  const { error: deliveryError } = await db.from("deliveries").insert({
    subscription_id: params.subscriptionId,
    status: params.status,
    items,
    error: params.error ?? null,
  });
  if (deliveryError) {
    console.error("[engine] écriture de la delivery impossible :", deliveryError.message);
  }

  if (params.status !== "success") return;

  // On ne journalise que les articles réellement retenus par le modèle, en
  // retrouvant l'URL d'origine du flux à partir de l'URL renvoyée.
  const byNorm = new Map(params.articles.map((a) => [a.url_norm, a]));
  const rows = items
    .map((item) => {
      const norm = normalizeUrl(item.url);
      if (!norm) return null;
      const match = byNorm.get(norm);
      return {
        subscription_id: params.subscriptionId,
        url: match ? match.url : item.url,
        url_hash: norm,
        url_norm: norm,
        title: item.title || match?.title || "",
        title_key: match?.title_key ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return;

  const { error: itemsError } = await db
    .from("delivered_items")
    .upsert(rows, { onConflict: "subscription_id,url_hash", ignoreDuplicates: true });
  if (itemsError) {
    console.error("[engine] écriture des items envoyés impossible :", itemsError.message);
  }
}
