import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setWorkflowActive, deleteWorkflow } from "@/lib/n8n";

/**
 * Actions sur une veille :
 * PATCH { action: "pause" | "resume" } : désactive/réactive le workflow n8n
 * DELETE : supprime le workflow n8n puis la veille (cascade sur sources/deliveries)
 */

async function getOwnedSubscription(id: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, sub: null, unauthorized: true };
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, status, n8n_workflow_id")
    .eq("id", id)
    .maybeSingle();
  return { supabase, sub, unauthorized: false };
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { supabase, sub, unauthorized } = await getOwnedSubscription(params.id);
  if (unauthorized) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!sub) return NextResponse.json({ error: "Veille introuvable" }, { status: 404 });

  const { action } = await request.json();
  if (action !== "pause" && action !== "resume") {
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  }

  try {
    if (sub.n8n_workflow_id) {
      await setWorkflowActive(sub.n8n_workflow_id, action === "resume");
    }
    const status = action === "resume" ? "active" : "paused";
    await supabase
      .from("subscriptions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", sub.id);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur n8n" }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const { supabase, sub, unauthorized } = await getOwnedSubscription(params.id);
  if (unauthorized) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!sub) return NextResponse.json({ error: "Veille introuvable" }, { status: 404 });

  try {
    if (sub.n8n_workflow_id) {
      await deleteWorkflow(sub.n8n_workflow_id);
    }
    await supabase.from("subscriptions").delete().eq("id", sub.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur n8n" }, { status: 502 });
  }
}
