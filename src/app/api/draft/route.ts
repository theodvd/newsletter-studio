import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Au-delà, un brouillon n'est plus repris par « New digest ». */
const DRAFT_RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

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

  // ?id= : édition d'une veille précise (active comprise). Sinon, « New
  // digest » ne reprend qu'une création INTERROMPUE, c'est-à-dire un
  // brouillon touché dans les dernières 24 h : au-delà, un vieux brouillon
  // oublié (celui de juin, par exemple) ressurgissait à chaque nouvelle veille.
  if (id) {
    query = query.eq("id", id);
  } else {
    const since = new Date(Date.now() - DRAFT_RESUME_WINDOW_MS).toISOString();
    query = query
      .eq("status", "draft")
      .gte("updated_at", since)
      .order("updated_at", { ascending: false });
  }

  const { data: draft } = await query.limit(1).maybeSingle();
  return NextResponse.json({ draft: draft ?? null });
}
