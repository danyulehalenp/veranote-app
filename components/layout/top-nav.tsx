'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ProviderIdentitySwitcher } from '@/components/layout/provider-identity-switcher';
import { BrandLockup } from '@/components/veranote/BrandLockup';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

const primaryLinks = [
  { href: '/', label: 'Workspace' },
  { href: '/dashboard/review', label: 'Full Review' },
  { href: '/dashboard/drafts', label: 'Saved Drafts' },
];

const secondaryLinks = [
  { href: '/dashboard/feedback', label: 'Feedback Inbox', status: 'Internal' },
  { label: 'Templates', status: 'Internal' },
  { label: 'Examples', status: 'Internal' },
  { label: 'Eval', status: 'Not live' },
  { label: 'Eval Results', status: 'Not live' },
];

export function TopNav() {
  const pathname = usePathname();
  const feedbackHref = `${pathname === '/' ? '' : pathname}#beta-feedback`;

  return (
    <header className="sticky top-0 z-40 border-b border-cyan-200/10 bg-[rgba(4,12,24,0.82)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="shrink-0">
          <Link href="/" className="inline-flex rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-300/40 focus:ring-offset-2 focus:ring-offset-[rgba(4,12,24,0.82)]">
            <BrandLockup variant="nav" subtitle="Clinical Note Intelligence Workspace" />
          </Link>
        </div>
        <div className="flex flex-1 flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <ProviderIdentitySwitcher />
            <Link
              href={feedbackHref}
              className="rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.68)] px-4 py-2 text-sm font-medium text-ink transition hover:border-cyan-200/20 hover:bg-[rgba(18,181,208,0.12)] hover:text-cyan-50"
            >
              Beta Feedback
            </Link>
            <nav className="flex flex-wrap gap-2">
            {primaryLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${pathname === link.href
                  ? 'border-cyan-200/30 bg-[rgba(18,181,208,0.18)] text-cyan-50 shadow-[0_8px_24px_rgba(15,157,180,0.18)]'
                  : 'border-cyan-200/10 bg-[rgba(13,30,50,0.68)] text-ink hover:border-cyan-200/20 hover:bg-[rgba(18,181,208,0.12)] hover:text-cyan-50'}`}
              >
                {link.label}
              </Link>
            ))}
            </nav>
          </div>
          {INTERNAL_MODE_ENABLED ? (
            <div className="flex flex-wrap items-center gap-3 rounded-full border border-cyan-200/10 bg-[rgba(11,29,49,0.72)] px-4 py-2 text-xs text-muted shadow-[0_10px_30px_rgba(4,12,24,0.28)]">
              <span className="font-semibold uppercase tracking-[0.18em] text-slate-500">Support tools</span>
              {secondaryLinks.map((link) => (
                link.href ? (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-[rgba(13,30,50,0.88)] px-3 py-1 text-cyan-50 transition hover:border-cyan-200/30 hover:bg-[rgba(18,181,208,0.12)]"
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-bold text-slate-950">i</span>
                    <span>{link.label}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/80">{link.status}</span>
                  </Link>
                ) : (
                  <span key={link.label} className="inline-flex items-center gap-2 rounded-full border border-rose-200/20 bg-[rgba(79,22,46,0.92)] px-3 py-1 text-rose-100">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">X</span>
                    <span>{link.label}</span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-200">{link.status}</span>
                  </span>
                )
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
