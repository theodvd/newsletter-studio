import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Démarre le flow OAuth Slack (scope incoming-webhook) pour une veille.
 * L'utilisateur choisit son workspace ET le canal (ou ses DM) dans
 * l'écran officiel Slack ; on récupère une URL de webhook au retour.
 */
export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const subscriptionId = searchParams.get("subscription");
  const base = process.env.NEXT_PUBLIC_APP_URL;
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "SLACK_CLIENT_ID manquant côté serveur (voir .env.example)" },
      { status: 500 }
    );
  }

  // RLS : vérifie que la veille appartient bien à l'utilisateur connecté
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: "Veille introuvable" }, { status: 404 });

  const authorize = new URL("https://slack.com/oauth/v2/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("scope", "incoming-webhook");
  authorize.searchParams.set("redirect_uri", `${base}/api/slack/callback`);
  authorize.searchParams.set("state", sub.id);

  return NextResponse.redirect(authorize.toString());
}
