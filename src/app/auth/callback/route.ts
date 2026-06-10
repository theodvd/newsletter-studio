import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback du magic link : échange le code contre une session.
 * Inscription ouverte — toute personne avec un email valide peut créer son compte
 * (le profil est créé automatiquement par le trigger handle_new_user).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Derrière le reverse proxy, l'origine vue par le conteneur est son hostname
  // Docker (ex: https://6c47a8031e97:3000) → on force l'URL publique.
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${base}/`);
    }
  }

  return NextResponse.redirect(`${base}/login?error=auth`);
}
