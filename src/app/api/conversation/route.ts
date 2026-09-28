import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/conversation?subscriptionId=<uuid>
 * Historique de conversation sauvegardé pour une veille, opt-in (voir
 * `profiles.keep_history`, `POST /api/settings/history`, `0009_history.sql`).
 *
 * Propriété vérifiée deux fois, comme partout où une table server-only est
 * lue : d'abord avec le client à SESSION sur `subscriptions` (le RLS garantit
 * déjà qu'on ne voit que ses propres veilles), puis explicitement par
 * `user_id` sur la lecture de `conversations`, table qui ignore le RLS avec
 * la clé service.
 */
export async function GET(request: Request) {
  const subscriptionId = new URL(request.url).searchParams.get("subscriptionId");
  if (!subscriptionId) return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: owned } = await supabase.from("subscriptions").select("id").eq("id", subscriptionId).maybeSingle();
  if (!owned) return NextResponse.json({ messages: [] });

  const { data } = await createAdminClient()
    .from("conversations")
    .select("messages")
    .eq("subscription_id", subscriptionId)
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ messages: data?.messages ?? [] });
}
