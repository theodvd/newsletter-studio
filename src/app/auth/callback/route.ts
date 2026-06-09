import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback du magic link : échange le code contre une session,
 * puis vérifie la liste blanche (allowed_emails).
 * Un email non autorisé est déconnecté et renvoyé vers /login.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user?.email) {
      // RLS : un utilisateur authentifié ne peut lire que sa propre entrée
      const { data: allowed } = await supabase
        .from("allowed_emails")
        .select("email")
        .eq("email", data.user.email)
        .maybeSingle();

      if (!allowed) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=unauthorized`);
      }
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
