import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Client Supabase côté serveur (Server Components, API routes).
 * La session est lue/écrite dans les cookies de la requête.
 *
 * Asynchrone depuis Next 15 : `cookies()` renvoie une Promise, il faut donc
 * l'attendre ici, et chaque appelant écrit `await createClient()`.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Appelé depuis un Server Component : le middleware rafraîchit la session.
          }
        },
      },
    }
  );
}

/**
 * Client admin (service_role) : contourne le RLS.
 * Réservé aux opérations backend (provisioning, webhooks moteur).
 * Ne JAMAIS importer dans du code exposé au client.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
