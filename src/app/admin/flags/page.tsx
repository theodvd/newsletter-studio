import { notFound } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { RETENTION_DAYS } from "@/lib/abuse/report";
import { FlagCard } from "./flag-card";

export const dynamic = "force-dynamic";

/**
 * Conversations signalées.
 *
 * Réservé aux adresses listées dans ADMIN_EMAILS. Pour quelqu'un d'autre, la
 * page n'existe pas : un 404 plutôt qu'un 403, qui confirmerait l'existence
 * d'une console d'administration.
 */
export default async function FlagsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAdmin(user?.email)) notFound();

  // La table est strictement serveur : lecture par la clé service, après
  // vérification de l'identité ci-dessus.
  const { data: flags } = await createAdminClient()
    .from("flagged_conversations")
    .select("id, email, score, summary, signals, messages, reviewed, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const pending = (flags ?? []).filter((f) => !f.reviewed).length;

  return (
    <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
      <p className="font-display text-xs uppercase tracking-[0.3em] text-accent/70">Admin</p>
      <h1 className="font-display mt-3 text-4xl font-semibold tracking-tight text-ice">
        Flagged conversations
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
        Onboarding conversations that tripped a signal: someone trying to steer the agent, fishing
        for secrets, or probing the internal network. Conversations that trip nothing are never
        stored, and flagged ones are deleted after {RETENTION_DAYS} days.
      </p>

      <p className="mt-6 text-sm text-slate-500">
        {flags?.length ? (
          <>
            <span className="text-slate-300">{flags.length}</span> flagged,{" "}
            <span className={pending ? "text-amber-400" : "text-slate-300"}>{pending}</span> not
            reviewed yet
          </>
        ) : (
          "Nothing flagged so far."
        )}
      </p>

      <div className="mt-8 space-y-4">
        {(flags ?? []).map((flag) => (
          <FlagCard key={flag.id} flag={flag} />
        ))}
      </div>
    </main>
  );
}
