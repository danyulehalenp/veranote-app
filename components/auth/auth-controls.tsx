'use client';

import { signOut, useSession } from 'next-auth/react';

export function AuthControls() {
  const { data, status } = useSession();

  if (status !== 'authenticated' || !data?.user) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.68)] px-2.5 py-1.5 text-xs text-cyan-50/84 sm:gap-2 sm:rounded-full sm:px-3 sm:py-2">
      <span className="hidden font-semibold uppercase tracking-[0.14em] text-slate-500 sm:inline">Signed in</span>
      <span className="max-w-[210px] truncate rounded-full border border-cyan-200/15 bg-[rgba(4,12,24,0.62)] px-3 py-1.5 text-sm text-cyan-50">
        {data.user.name}
      </span>
      <span className="hidden text-[11px] text-cyan-50/68 md:inline">
        {data.user.organizationName} • {data.user.roleLabel}
      </span>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: '/sign-in' })}
        className="hidden rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.68)] px-4 py-2 text-sm font-medium text-ink transition hover:border-cyan-200/20 hover:bg-[rgba(18,181,208,0.12)] hover:text-cyan-50 sm:inline-flex"
      >
        Sign out
      </button>
    </div>
  );
}
