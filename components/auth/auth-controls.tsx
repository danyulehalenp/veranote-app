'use client';

import { signOut, useSession } from 'next-auth/react';

export function AuthControls() {
  const { data, status } = useSession();

  if (status !== 'authenticated' || !data?.user) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.68)] px-3 py-2 text-xs text-cyan-50/84">
      <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Signed in</span>
      <span className="rounded-full border border-cyan-200/15 bg-[rgba(4,12,24,0.62)] px-3 py-1.5 text-sm text-cyan-50">
        {data.user.name}
      </span>
      <span className="text-[11px] text-cyan-50/68">
        {data.user.organizationName} • {data.user.roleLabel}
      </span>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: '/sign-in' })}
        className="rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.68)] px-4 py-2 text-sm font-medium text-ink transition hover:border-cyan-200/20 hover:bg-[rgba(18,181,208,0.12)] hover:text-cyan-50"
      >
        Sign out
      </button>
    </div>
  );
}
