import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Renvoie le dernier brouillon de veille de l'utilisateur,
 * pour restaurer l'encart de récap quand on rouvre /onboarding
 * (permet de re-cliquer « Valider et lancer » sans refaire la conversation).
 */
export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  let query = supabase
    .from("subscriptions")
    .select(
      "id, name, channel, destination, destination_label, frequency_cron, tone, language, status, design, sources(url, feed_url, title, type, validation_status, added_by)"
    );

  // ?id= : édition d'une veille précise (active comprise) ; sinon dernier brouillon
  if (id) {
    query = query.eq("id", id);
  } else {
    query = query.eq("status", "draft").order("updated_at", { ascending: false });
  }

  const { data: draft } = await query.limit(1).maybeSingle();
  return NextResponse.json({ draft: draft ?? null });
}
