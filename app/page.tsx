import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { NewNoteForm } from '@/components/note/new-note-form';
import { BrandLockup } from '@/components/veranote/BrandLockup';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

const liveWorkflowCards = [
  {
    title: 'Main workspace',
    body: 'Compose the note, generate the draft, and finish review in one continuous provider-facing workflow.',
  },
  {
    title: 'Saved drafts',
    body: 'Reopen unfinished notes without losing where review stopped.',
    href: '/dashboard/drafts',
    cta: 'Open drafts',
  },
  {
    title: 'Full review page',
    body: 'Use the larger standalone review surface only when you want a dedicated final pass.',
    href: '/dashboard/review',
    cta: 'Open full review',
  },
];

const notLiveCards = [
  {
    title: 'Templates',
    body: 'Still being organized for internal setup work. Providers should not rely on this surface yet.',
    status: 'Internal only',
  },
  {
    title: 'Examples',
    body: 'Useful for testing and demos, but not part of the provider beta workflow yet.',
    status: 'Not live',
  },
  {
    title: 'Eval',
    body: 'Regression and product-pressure tooling for internal validation, not daily provider use.',
    status: 'Not live',
  },
  {
    title: 'Eval Results',
    body: 'Internal measurement and tuning surface, not a provider-facing workflow.',
    status: 'Not live',
  },
];

const providerPrinciples = [
  'One patient note should mostly live on one page.',
  'The draft must stay close to source instead of sounding falsely complete.',
  'Review is part of the same workflow, not a second product.',
  'Internal tools should look clearly unavailable to providers until they are ready.',
];

function NotLiveCard(props: { title: string; body: string; status: string }) {
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-rose-200/20 bg-[linear-gradient(135deg,rgba(79,22,46,0.96),rgba(56,14,31,0.98))] p-5 shadow-[0_16px_44px_rgba(40,8,22,0.28)]">
      <div className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-rose-600 text-sm font-bold text-white shadow-[0_10px_20px_rgba(225,29,72,0.28)]">
        X
      </div>
      <div className="pr-12">
        <div className="text-lg font-semibold text-rose-50">{props.title}</div>
        <p className="mt-2 text-sm leading-6 text-rose-100">{props.body}</p>
        <div className="mt-4 inline-flex rounded-full border border-rose-200/18 bg-[rgba(255,255,255,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-100">
          {props.status}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <AppShell
      title="Provider Workspace"
      subtitle="A premium, review-first Veranote workspace built for real psych documentation speed: one patient note, one main surface, high-trust output."
    >
      <section className="overflow-hidden rounded-[32px] border border-cyan-200/70 bg-[linear-gradient(140deg,rgba(4,13,27,0.98),rgba(6,34,61,0.96)_52%,rgba(9,118,144,0.90))] p-8 text-white shadow-[0_36px_110px_rgba(6,21,40,0.34)]">
        <div className="grid gap-8 xl:grid-cols-[1.3fr_0.7fr]">
          <div>
            <div className="inline-flex rounded-full border border-cyan-200/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
              Trusted provider workspace
            </div>
            <div className="mt-6 space-y-4">
              <BrandLockup variant="hero" />
              <h2 className="max-w-3xl text-4xl font-semibold text-white md:text-5xl">
                High-tech clinical note drafting without the clutter.
              </h2>
            </div>
            <p className="mt-4 max-w-2xl text-base leading-8 text-cyan-50/88">
              Start the note here, keep review in the same flow, and use the full review page only when you want a larger dedicated pass.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="#workspace" className="inline-flex items-center rounded-xl border border-cyan-100/30 bg-[linear-gradient(135deg,#d8fbff_0%,#bff4ff_44%,#8ae8ff_100%)] px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_42px_rgba(100,220,255,0.22)] transition hover:-translate-y-[1px] hover:shadow-[0_22px_54px_rgba(100,220,255,0.28)]">
                Start in workspace
              </Link>
              <Link href="/dashboard/drafts" className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm">
                Open saved drafts
              </Link>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Provider principles</div>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-cyan-50/88">
              {providerPrinciples.map((item) => (
                <li key={item} className="rounded-xl border border-white/10 bg-white/6 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
        <div id="workspace" className="aurora-panel overflow-hidden rounded-[30px] p-4 md:p-6">
          <div className="aurora-panel aurora-edge-emphasis mb-5 rounded-[24px] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Main provider flow</div>
                <h3 className="mt-1 text-2xl font-semibold text-white">Compose, review, and finish the note here</h3>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-cyan-50/88">
                  This is the main workspace for composing, reviewing, and finishing the note. The goal is to keep the real work visible and centered on one patient note.
                </p>
              </div>
              <div className="aurora-pill rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">
                Live now
              </div>
            </div>
          </div>

          <NewNoteForm />
        </div>

        <div className="grid gap-6">
          <section className="aurora-panel rounded-[30px] p-6">
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Available for providers</div>
            <div className="mt-4 space-y-4">
              {liveWorkflowCards.map((card) => (
                <div key={card.title} className="aurora-soft-panel rounded-[22px] p-4">
                  <div className="text-lg font-semibold text-ink">{card.title}</div>
                  <p className="mt-2 text-sm leading-6 text-muted">{card.body}</p>
                  {card.href ? (
                    <Link href={card.href} className="aurora-secondary-button mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-semibold">
                      {card.cta}
                    </Link>
                  ) : (
                    <div className="mt-4 inline-flex rounded-full border border-emerald-200/20 bg-[rgba(59,224,185,0.12)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                      Active on this page
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {INTERNAL_MODE_ENABLED ? (
            <section className="aurora-panel rounded-[30px] p-6">
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Still in production</div>
              <div className="mt-4 space-y-4">
                {notLiveCards.map((card) => (
                  <NotLiveCard key={card.title} {...card} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
