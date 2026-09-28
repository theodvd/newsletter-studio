import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/**
 * Choix d'opt-in de conservation de la conversation avec Lia
 * (`profiles.keep_history`, voir `0009_history.sql`).
 *
 * GET                    : état actuel (`null` = jamais demandé).
 * POST { keep: boolean } : enregistre le choix. `keep: false` supprime aussi
 *   toutes les conversations déjà stockées pour ce compte : un « non »
 *   explicite doit effacer ce qui existe, pas seulement arrêter d'écrire.
 *
 * `keep_history` et `conversations` sont server-only (comme `design` et
 * `previews`) : ni l'un ni l'autre n'est accordé en lecture/écriture au rôle
 * `authenticated`, toute opération passe donc par la clé service, avec un
 * filtre de propriété explicite puisque cette clé ignore le RLS.
 */

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("keep_history")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ keepHistory: data?.keep_history ?? null });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { keep?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.keep !== "boolean") {
    return NextResponse.json({ error: "Missing boolean 'keep'." }, { status: 400 });
  }

  const db = createAdminClient();
  const { error } = await db.from("profiles").update({ keep_history: body.keep }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.keep === false) {
    const { error: deleteError } = await db.from("conversations").delete().eq("user_id", user.id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, keepHistory: body.keep });
}
