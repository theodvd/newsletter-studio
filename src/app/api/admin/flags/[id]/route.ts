import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

/**
 * Marque une conversation signalée comme relue.
 * Réservé aux adresses de ADMIN_EMAILS : la table est inaccessible au client,
 * l'écriture passe donc par la clé service, après vérification de l'identité.
 */
export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Même réponse qu'une route inexistante : ne pas confirmer qu'une console
  // d'administration existe.
  if (!isAdmin(user?.email)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("flagged_conversations")
    .update({ reviewed: true })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
