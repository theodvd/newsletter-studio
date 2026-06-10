import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Retour du flow OAuth Slack : échange le code contre l'URL du webhook
 * entrant (incoming_webhook.url) et l'enregistre comme destination
 * de la veille. Aucun token n'est stocké.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const code = searchParams.get("code");
  const subscriptionId = searchParams.get("state");

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${base}/login`);

  if (!code || !subscriptionId) {
    // L'utilisateur a annulé l'autorisation Slack
    return NextResponse.redirect(`${base}/onboarding?slack=cancelled`);
  }

  const body = new URLSearchParams({
    code,
    client_id: process.env.SLACK_CLIENT_ID ?? "",
    client_secret: process.env.SLACK_CLIENT_SECRET ?? "",
    redirect_uri: `${base}/api/slack/callback`,
  });

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();

  if (!data.ok || !data.incoming_webhook?.url) {
    console.error("Slack OAuth échec:", data.error);
    return NextResponse.redirect(`${base}/onboarding?slack=error`);
  }

  // RLS : ne met à jour la veille que si elle appartient à l'utilisateur
  const { error } = await supabase
    .from("subscriptions")
    .update({
      destination: data.incoming_webhook.url,
      destination_label: `${data.incoming_webhook.channel} · ${data.team?.name ?? "Slack"}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscriptionId);

  if (error) return NextResponse.redirect(`${base}/onboarding?slack=error`);
  return NextResponse.redirect(`${base}/onboarding?slack=connected`);
}
