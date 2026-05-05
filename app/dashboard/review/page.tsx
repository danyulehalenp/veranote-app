import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { ReviewWorkspace } from '@/components/note/review-workspace';

export default function ReviewPage() {
  return (
    <AppShell
      title="Review"
      hidePageHeader
      fullWidth
    >
      <section className="relative mb-4 overflow-hidden rounded-[28px] border border-cyan-200/15 bg-[radial-gradient(circle_at_top_left,rgba(18,181,208,0.16),transparent_34%),linear-gradient(135deg,rgba(7,18,31,0.98),rgba(10,29,48,0.94)_58%,rgba(9,42,58,0.9))] px-5 py-5 text-cyan-50 shadow-[0_20px_60px_rgba(4,12,24,0.34)]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:28px_28px] opacity-30" />
        <div className="pointer-events-none absolute right-[-8rem] top-[-7rem] h-56 w-56 rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-7rem] left-[-5rem] h-52 w-52 rounded-full bg-sky-300/10 blur-3xl" />

        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em]">
              <span className="rounded-full border border-cyan-200/20 bg-white/8 px-3 py-1 text-cyan-100">
                Dedicated review
              </span>
              <span className="rounded-full border border-cyan-200/15 bg-[rgba(9,25,42,0.72)] px-3 py-1 text-cyan-100/80">
                Provider-first pass
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-[-0.03em] text-white md:text-[2.65rem]">
                  Review and finalize
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-50/72">
                  Keep the note, source checks, and finish path on one screen. Drop into the lower drawer only when you need deeper support.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard/drafts"
                  className="inline-flex rounded-xl border border-cyan-200/20 bg-white/8 px-3.5 py-2 text-sm font-semibold text-cyan-50 transition hover:border-cyan-200/30 hover:bg-white/12"
                >
                  Saved drafts
                </Link>
                <Link
                  href="/dashboard/new-note"
                  className="inline-flex rounded-xl border border-cyan-200/15 bg-[rgba(8,22,36,0.84)] px-3.5 py-2 text-sm font-semibold text-cyan-50 transition hover:border-cyan-200/30 hover:bg-[rgba(12,34,52,0.92)]"
                >
                  Back to workspace
                </Link>
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 xl:w-[28rem]">
            <div className="rounded-2xl border border-cyan-200/12 bg-[rgba(6,20,34,0.66)] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/68">
                01 Edit
              </div>
              <div className="mt-1 text-sm font-medium text-white">
                Keep the note tight and source-faithful.
              </div>
            </div>
            <div className="rounded-2xl border border-cyan-200/12 bg-[rgba(6,20,34,0.66)] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/68">
                02 Confirm
              </div>
              <div className="mt-1 text-sm font-medium text-white">
                Mark what is approved and what still needs review.
              </div>
            </div>
            <div className="rounded-2xl border border-cyan-200/12 bg-[rgba(6,20,34,0.66)] px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/68">
                03 Finish
              </div>
              <div className="mt-1 text-sm font-medium text-white">
                Copy or export only when the draft is ready.
              </div>
            </div>
          </div>
        </div>
      </section>
      <ReviewWorkspace />
    </AppShell>
  );
}
