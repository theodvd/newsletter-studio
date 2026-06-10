"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Navigation principale (verre, fixe en haut) : logo, liens, déconnexion.
 * Rendue uniquement quand une session existe (voir layout).
 */
const LINKS = [
  { href: "/", label: "Home" },
  { href: "/onboarding", label: "New digest" },
  { href: "/dashboard", label: "My digests" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <nav className="glass flex w-full max-w-3xl items-center justify-between rounded-2xl px-5 py-2.5">
        <Link href="/" className="font-display text-sm font-semibold tracking-tight text-white">
          ❄︎ Newsletter Studio
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                "rounded-lg px-3 py-1.5 text-sm transition-colors " +
                (pathname === l.href
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white")
              }
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={signOut}
            className="ml-2 rounded-lg px-3 py-1.5 text-sm text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>
  );
}
