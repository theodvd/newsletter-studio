import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback du magic link : échange le code contre une session.
 * Inscription ouverte — toute personne avec un email valide peut créer son compte
 * (le profil est créé automatiquement par le trigger handle_new_user).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
