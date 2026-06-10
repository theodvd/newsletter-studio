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
    .select("id, name, frequency_cron, status, n8n_workflow_id, channel, destination, sources(id)")
    .eq("id", subscriptionId)
    .maybeSingle();

  if (error || !sub) return NextResponse.json({ error: "Digest not found" }, { status: 404 });
  if (sub.channel === "slack" && !sub.destination?.startsWith("https://hooks.slack.com")) {
    return NextResponse.json(
      { error: "Connect your Slack first (button in the summary panel)." },
      { status: 400 }
    );
  }
  // Anti-spam : un digest email ne part que vers l'adresse du compte connecté
  if (sub.channel === "email" && sub.destination !== user.email) {
    return NextResponse.json(
      { error: "Email digests can only be sent to your own account email." },
      { status: 403 }
    );
  }
  if (!sub.sources?.length) {
    return NextResponse.json({ error: "No sources configured yet — finish the conversation with Lia." }, { status: 400 });
  }
  if (sub.n8n_workflow_id) {
    return NextResponse.json({ error: "This digest already has a workflow.", workflowId: sub.n8n_workflow_id }, { status: 409 });
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
