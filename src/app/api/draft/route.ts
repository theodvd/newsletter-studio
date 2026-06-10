import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Renvoie le dernier brouillon de veille de l'utilisateur,
 * pour restaurer l'encart de récap quand on rouvre /onboarding
 * (permet de re-cliquer « Valider et lancer » sans refaire la conversation).
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: draft } = await supabase
    .from("subscriptions")
    .select(
      "id, name, channel, destination, destination_label, frequency_cron, tone, language, status, sources(url, feed_url, title, type, validation_status, added_by)"
    )
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ draft: draft ?? null });
}
