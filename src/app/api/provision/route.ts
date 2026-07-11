import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createUserWorkflow } from "@/lib/n8n";
import { runsPerWeek } from "@/lib/pricing";
import { monthlySpendUsd, projectedMonthlyCostUsd } from "@/lib/usage";
import { PLAN_LIMITS, getUserPlan, maxSourcesFor } from "@/lib/plan";

/**
 * Provisioning : à la validation du brouillon, crée le workflow fin
 * dans n8n (cron du user → moteur partagé) et passe la veille en "active".
 *
 * Gating plan (dans l'ordre) :
 *  1. Nombre de veilles actives (maxActiveDigests)
 *  2. Cadence (maxRunsPerWeek)
 *  3. Nombre de sources (maxSourcesDaily / maxSourcesWeekly selon cadence)
 *  4. Plafond mensuel projeté (monthlyCapUsd)
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

  // Récupère le plan de l'utilisateur et ses limites
  const plan = await getUserPlan(supabase);
  const limits = PLAN_LIMITS[plan];

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
    return NextResponse.json(
      { error: "No sources configured yet. Finish the conversation with Lia." },
      { status: 400 }
    );
  }
  if (sub.n8n_workflow_id) {
    return NextResponse.json(
      { error: "This digest already has a workflow.", workflowId: sub.n8n_workflow_id },
      { status: 409 }
    );
  }

  // Récupère les veilles actives (hors celle en cours de provisioning)
  const { data: actives } = await supabase
    .from("subscriptions")
    .select("frequency_cron")
    .eq("status", "active");

  // --- Gate 1 : nombre de veilles actives ---
  const activeCount = actives?.length ?? 0;
  if (activeCount >= limits.maxActiveDigests) {
    return NextResponse.json(
      {
        error:
          plan === "free"
            ? `Free plan allows ${limits.maxActiveDigests} active digest. Pause or edit your existing digest, or upgrade to Pro to run up to ${PLAN_LIMITS.pro.maxActiveDigests} at once.`
            : `You've reached the limit of ${limits.maxActiveDigests} active digests.`,
      },
      { status: 403 }
    );
  }

  // --- Gate 2 : cadence (runs/semaine) ---
  const runs = runsPerWeek(sub.frequency_cron);
  if (runs > limits.maxRunsPerWeek) {
    return NextResponse.json(
      {
        error:
          `This schedule runs ~${runs}×/week, but your ${limits.label} plan allows up to ${limits.maxRunsPerWeek}×/week. ` +
          (plan === "free"
            ? "Upgrade to Pro for daily or twice-daily delivery."
            : "Reduce the delivery frequency to continue."),
      },
      { status: 403 }
    );
  }

  // --- Gate 3 : nombre de sources ---
  const sourceCount = sub.sources?.length ?? 0;
  const maxSources = maxSourcesFor(limits, runs);
  if (sourceCount > maxSources) {
    return NextResponse.json(
      {
        error:
          `This digest has ${sourceCount} sources, but your ${limits.label} plan allows up to ${maxSources} for this cadence. ` +
          (plan === "free"
            ? "Upgrade to Pro to add up to 12 sources."
            : "Remove some sources to continue."),
      },
      { status: 403 }
    );
  }

  // --- Gate 4 : plafond mensuel projeté ---
  const crons = [...(actives ?? []).map((a) => a.frequency_cron), sub.frequency_cron];
  const projected = projectedMonthlyCostUsd(crons, runsPerWeek);
  const spent = await monthlySpendUsd(supabase);
  const cap = limits.monthlyCapUsd;
  if (spent + projected > cap) {
    return NextResponse.json(
      {
        error:
          `This schedule would exceed your $${cap.toFixed(2)}/month budget (projected ~$${(spent + projected).toFixed(2)}). ` +
          (plan === "free"
            ? "Try a lower frequency, pause another digest, or upgrade to Pro for a higher budget."
            : "Try a lower frequency or pause another digest."),
      },
      { status: 403 }
    );
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
