import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createUserWorkflow } from "@/lib/n8n";

/**
 * Provisioning : à la validation du brouillon, crée le workflow fin
 * dans n8n (cron du user → moteur partagé) et passe la veille en "active".
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { subscriptionId } = await request.json();
  if (!subscriptionId) {
    return NextResponse.json({ error: "subscriptionId manquant" }, { status: 400 });
  }

  // RLS : ne renvoie la subscription que si elle appartient au user
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("id, name, frequency_cron, status, n8n_workflow_id, sources(id)")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (error || !sub) return NextResponse.json({ error: "Veille introuvable" }, { status: 404 });
  if (!sub.sources?.length) {
    return NextResponse.json({ error: "Aucune source configurée : complète la conversation avec Lia." }, { status: 400 });
  }
  if (sub.n8n_workflow_id) {
    return NextResponse.json({ error: "Cette veille a déjà un workflow.", workflowId: sub.n8n_workflow_id }, { status: 409 });
  }

  try {
    const workflowId = await createUserWorkflow({
      name: sub.name,
      cron: sub.frequency_cron,
      subscriptionId: sub.id,
    });

    await supabase
      .from("subscriptions")
      .update({ status: "active", n8n_workflow_id: workflowId, updated_at: new Date().toISOString() })
      .eq("id", sub.id);

    return NextResponse.json({ ok: true, workflowId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur n8n" },
      { status: 502 }
    );
  }
}
