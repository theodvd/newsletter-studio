"use client";

import Link from "next/link";

/**
 * Encart sobre affiché aux utilisateurs Free pour présenter les bénéfices Pro.
 * Style glass existant, sobre, pas intrusif.
 */
export function PlanBanner() {
  return (
    <div className="glass mt-6 flex flex-col gap-3 rounded-2xl border border-white/8 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-slate-200">
          Upgrade to Pro
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
          Daily digests, deeper analysis, up to 3 digests and 12 sources.
        </p>
      </div>
      <Link
        href="/#pricing"
        className="shrink-0 rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-400/20 hover:text-sky-200"
      >
        See plans →
      </Link>
    </div>
  );
}
