'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthControls } from '@/components/auth/auth-controls';
import { ProviderIdentitySwitcher } from '@/components/layout/provider-identity-switcher';
import { BrandLockup } from '@/components/veranote/BrandLockup';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';
import { summarizeBetaFeedbackQueue } from '@/lib/beta/vera-gaps';
import type { BetaFeedbackItem } from '@/types/beta-feedback';

const primaryLinks = [
  { href: '/dashboard/new-note', label: 'Workspace', helper: 'Build and review notes' },
  { href: '/dashboard/drafts', label: 'Saved Drafts', helper: 'Recover prior work' },
];

const supportLinks = [
  { href: '/dashboard/review', label: 'Deep Review', status: 'Secondary' },
];

const secondaryLinks = [
  { href: '/dashboard/internal', label: 'Internal Workbench', status: 'Internal' },
  { href: '/dashboard/connectivity', label: 'Connectivity', status: 'Internal' },
  { href: '/monitoring', label: 'Monitoring', status: 'Internal' },
  { href: '/dashboard/agent-factory', label: 'Agent Factory', status: 'Internal' },
];

export function TopNav() {
  const pathname = usePathname();
  const workspacePath = '/dashboard/new-note';
  const feedbackHref = `${pathname === workspacePath ? workspacePath : pathname}#beta-feedback`;
  const [feedbackSummary, setFeedbackSummary] = useState<ReturnType<typeof summarizeBetaFeedbackQueue> | null>(null);

  useEffect(() => {
    if (!INTERNAL_MODE_ENABLED) {
      return;
    }

    let isCancelled = false;

    async function loadFeedbackSummary() {
      try {
        const response = await fetch('/api/beta-feedback', {
          cache: 'no-store',
        });
        const data = await response.json() as { feedback?: BetaFeedbackItem[] };

        if (!response.ok || isCancelled) {
          return;
        }

        setFeedbackSummary(summarizeBetaFeedbackQueue(data.feedback || []));
      } catch {
        if (!isCancelled) {
          setFeedbackSummary(null);
        }
      }
    }

    void loadFeedbackSummary();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <header className="z-40 border-b border-cyan-200/10 bg-[rgba(4,12,24,0.82)] backdrop-blur-xl md:sticky md:top-0">
      <div className="flex w-full flex-col gap-2 px-3 py-2 md:px-4 lg:flex-row lg:items-center lg:justify-between lg:px-5">
        <div className="shrink-0">
          <Link href={workspacePath} className="inline-flex rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-300/40 focus:ring-offset-2 focus:ring-offset-[rgba(4,12,24,0.82)]">
            <BrandLockup variant="nav" subtitle="Clinical Note Intelligence Workspace" />
          </Link>
        </div>
        <div className="flex flex-1 flex-col gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {INTERNAL_MODE_ENABLED ? <ProviderIdentitySwitcher /> : null}
            <AuthControls />
            <nav className="flex flex-wrap gap-1.5 sm:gap-2" aria-label="Provider navigation">
              {primaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  title={link.helper}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium transition sm:px-4 sm:py-2 ${pathname === link.href
                    ? 'border-cyan-200/30 bg-[rgba(18,181,208,0.18)] text-cyan-50 shadow-[0_8px_24px_rgba(15,157,180,0.18)]'
                    : 'border-cyan-200/10 bg-[rgba(13,30,50,0.68)] text-ink hover:border-cyan-200/20 hover:bg-[rgba(18,181,208,0.12)] hover:text-cyan-50'}`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <Link
              href={feedbackHref}
              className="rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.68)] px-3 py-1.5 text-sm font-medium text-ink transition hover:border-cyan-200/20 hover:bg-[rgba(18,181,208,0.12)] hover:text-cyan-50 sm:px-3.5 sm:py-2"
            >
              <span className="inline-flex items-center gap-2">
                <span>Feedback</span>
                {feedbackSummary?.newCount ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950">
                    {feedbackSummary.newCount}
                  </span>
                ) : null}
              </span>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-cyan-200/10 bg-[rgba(11,29,49,0.52)] px-3 py-2 text-xs text-muted">
            <span className="font-semibold uppercase tracking-[0.18em] text-cyan-100/54">Main lane</span>
            <span className="text-cyan-50/76">Workspace to Saved Drafts</span>
            <span className="hidden text-cyan-50/48 sm:inline">Review stays inside Workspace unless you need the secondary screen.</span>
            {supportLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${pathname === link.href
                  ? 'border-cyan-200/34 bg-[rgba(18,181,208,0.16)] text-cyan-50'
                  : 'border-cyan-200/14 bg-[rgba(13,30,50,0.72)] text-cyan-50/78 hover:border-cyan-200/28 hover:text-cyan-50'}`}
              >
                <span>{link.label}</span>
                <span className="text-[9px] uppercase tracking-[0.14em] text-cyan-100/58">{link.status}</span>
              </Link>
            ))}
          </div>
          {INTERNAL_MODE_ENABLED ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-cyan-200/10 bg-[rgba(11,29,49,0.72)] px-4 py-2.5 text-xs text-muted shadow-[0_10px_30px_rgba(4,12,24,0.28)]">
              <span className="font-semibold uppercase tracking-[0.18em] text-slate-500">Internal tools</span>
              {secondaryLinks.map((link) => (
                link.href ? (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-[rgba(13,30,50,0.88)] px-3 py-1 text-cyan-50 transition hover:border-cyan-200/30 hover:bg-[rgba(18,181,208,0.12)]"
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-bold text-slate-950">i</span>
                    <span>{link.label}</span>
                    {link.href === '/dashboard/internal' && feedbackSummary?.newCount ? (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-cyan-300 px-1.5 py-0.5 text-[10px] font-semibold text-slate-950">
                        {feedbackSummary.newCount}
                      </span>
                    ) : null}
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
