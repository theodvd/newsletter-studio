import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware : rafraîchit la session Supabase et protège les pages.
 * Routes publiques : /login et /auth/* (callback magic link).
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // `getUser()` appelle Supabase Auth par le réseau : en dev hors-ligne
  // (Supabase pointé vers une adresse morte, voir le harnais `/dev/preview`),
  // cet appel rejette. Sans ce filet, une exception ici casserait TOUTES les
  // pages, y compris les routes publiques : on retombe sur "non connecté",
  // jamais sur un utilisateur inventé.
  let user: { email?: string | null } | null = null;
  try {
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();
    user = sessionUser;
  } catch {
    user = null;
  }

  const isPublic =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    // Le moteur est déclenché par un cron système, pas par une session :
    // la route porte sa propre authentification (secret en Bearer).
    request.nextUrl.pathname.startsWith("/api/cron") ||
    // Harnais de QA visuelle hors-ligne (`/dev/preview`) : jamais en
    // production, où la page elle-même appelle `notFound()`. Public ici
    // uniquement pour que le serveur de dev offline (Supabase injoignable)
    // puisse la servir sans session.
    (request.nextUrl.pathname.startsWith("/dev") && process.env.NODE_ENV !== "production");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Déjà connecté : /login (ex. re-clic sur un magic link consommé) → accueil
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Tout sauf les assets statiques
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
