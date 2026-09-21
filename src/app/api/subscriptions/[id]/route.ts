import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * Actions sur une veille :
 * PATCH { action: "pause" | "resume" } : bascule le statut
 * DELETE : supprime la veille (cascade sur sources, deliveries, delivered_items)
 *
 * Depuis le passage du moteur dans le dépôt, il n'y a plus de workflow n8n par
 * utilisateur à synchroniser : le statut en base fait foi, et le tick du moteur
 * ne considère que les veilles « active ».
 */

async function getOwnedSubscription(id: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { sub: null, userId: null, unauthorized: true };
  // Lecture via le client à session : le RLS garantit déjà la propriété ici.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  return { sub, userId: user.id, unauthorized: false };
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { sub, userId, unauthorized } = await getOwnedSubscription(params.id);
  if (unauthorized) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!sub) return NextResponse.json({ error: "Veille introuvable" }, { status: 404 });

  const { action } = await request.json();
  if (action !== "pause" && action !== "resume") {
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  }

  const status = action === "resume" ? "active" : "paused";

  // `status` est verrouillé côté base (migration 0003) : l'écriture passe par
  // la clé service, avec filtre de propriété explicite puisque le RLS ne
  // s'applique plus.
  const { error } = await createAdminClient()
    .from("subscriptions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", sub.id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { sub, userId, unauthorized } = await getOwnedSubscription(params.id);
  if (unauthorized) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!sub) return NextResponse.json({ error: "Veille introuvable" }, { status: 404 });

  const { error } = await createAdminClient()
    .from("subscriptions")
    .delete()
    .eq("id", sub.id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
