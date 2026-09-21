import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { validateCron } from "@/lib/cron";
import { LIMITS } from "@/lib/plan";

/**
 * Activation : à la validation du brouillon, passe la veille en "active".
 * Le moteur (tick dans ce dépôt) prend alors le relais selon son cron.
 *
 * Contrôles (défensifs, pas commerciaux : il n'y a plus de plan payant) :
 *  1. Forme du cron et cadence maximale
 *  2. Nombre de veilles actives
 *  3. Nombre de sources
 *  4. Présence d'une clé API : sans elle, rien ne pourrait être produit
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

  const limits = LIMITS;

  // RLS : ne renvoie la subscription que si elle appartient au user
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("id, name, frequency_cron, status, channel, destination, sources(id)")
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
  if (sub.status === "active") {
    return NextResponse.json({ error: "This digest is already active." }, { status: 409 });
  }

  // --- 1. Forme du cron et cadence (validateCron plafonne à 14 envois/semaine) ---
  const cronCheck = validateCron(sub.frequency_cron);
  if (!cronCheck.ok) {
    return NextResponse.json({ error: cronCheck.reason }, { status: 400 });
  }

  // --- 2. Nombre de veilles actives ---
  const { data: actives } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("status", "active");
  if ((actives?.length ?? 0) >= limits.maxActiveDigests) {
    return NextResponse.json(
      {
        error: `You already have ${limits.maxActiveDigests} active digests. Pause one before starting another.`,
      },
      { status: 403 }
    );
  }

  // --- 3. Nombre de sources ---
  const sourceCount = sub.sources?.length ?? 0;
  if (sourceCount > limits.maxSources) {
    return NextResponse.json(
      {
        error: `This digest has ${sourceCount} sources; the maximum is ${limits.maxSources}. Remove a few to keep the edition readable.`,
      },
      { status: 403 }
    );
  }

  // --- 4. Clé API : sans elle, le moteur ne produirait rien ---
  const { data: profile } = await supabase
    .from("profiles")
    .select("llm_key_hint")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.llm_key_hint) {
    return NextResponse.json(
      { error: "Connect your API key first: your editions run on your own key." },
      { status: 403 }
    );
  }

  // `status` est verrouillé côté base : écriture par la clé service, avec
  // filtre de propriété explicite (le RLS ne s'applique plus avec cette clé).
  const { error: activationError } = await createAdminClient()
    .from("subscriptions")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", sub.id)
    .eq("user_id", user.id);

  if (activationError) {
    return NextResponse.json({ error: activationError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: "active" });
}
