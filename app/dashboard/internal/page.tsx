import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { InternalSurfaceNotice } from '@/components/layout/internal-surface-notice';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

const internalTools = [
  {
    title: 'Agent Factory',
    href: '/dashboard/agent-factory',
    status: 'Internal only',
    body: 'Supervised builder queue for subagent specs, approvals, verification proof, and blocked child work.',
  },
  {
    title: 'Feedback Inbox',
    href: '/dashboard/feedback',
    status: 'Internal only',
    body: 'Review provider feedback, Vera gaps, and taught-versus-planned triage work in one operational queue.',
  },
  {
    title: 'Templates and Profiles',
    href: '/dashboard/templates',
    status: 'Internal only',
    body: 'Provider defaults, profile behavior, and internal planning surfaces for template-related product work.',
  },
  {
    title: 'Dictation History',
    href: '/dashboard/dictation-history',
    status: 'Internal only',
    body: 'Saved dictation sessions, flagged runs, and full audit trails for speech-to-source behavior.',
  },
  {
    title: 'Example Gallery',
    href: '/dashboard/examples',
    status: 'Internal only',
    body: 'Demo and test examples for loading fake or de-identified cases into the workflow.',
  },
  {
    title: 'Fidelity Evaluation',
    href: '/dashboard/eval',
    status: 'Internal only',
    body: 'Regression runner and focused evaluation workflow for trust, fidelity, and failure-prone cases.',
  },
  {
    title: 'Evaluation Results',
    href: '/dashboard/eval-results',
    status: 'Internal only',
    body: 'Saved scorecards, output snapshots, and historical evaluation review.',
  },
  {
    title: 'Vera Lab',
    href: '/admin/vera-lab',
    status: 'Internal only',
    body: 'Real-time internal QA loop: interrogator, judge, repair queue, and regression gate for realistic provider questions.',
  },
];

export default function InternalWorkbenchPage() {
  if (!INTERNAL_MODE_ENABLED) {
    redirect('/');
  }

  return (
    <AppShell
      title="Internal Workbench"
      subtitle="Keep internal planning, examples, and evaluation tools in one contained surface so the provider-facing shell stays focused on the real note workflow."
    >
      <InternalSurfaceNotice
        title="Internal workbench only"
        body="Everything here is for product tuning, demos, evaluation, or internal setup. The provider-facing product should still feel centered on Workspace, Saved Drafts, Review, and the in-flow Beta Feedback action."
      />

      <section className="aurora-panel rounded-[28px] p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Internal surfaces</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Product workbench, not provider workflow</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/84">
              Use this area for feedback triage, evaluation, examples, template planning, and other internal product work. The main provider product should still feel centered on Workspace, Saved Drafts, Review, and the in-flow feedback action.
            </p>
          </div>
          <Link
            href="/"
            className="aurora-secondary-button inline-flex rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Back to workspace
          </Link>
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        {internalTools.map((tool) => (
          <div key={tool.href} className="aurora-panel rounded-[28px] p-6">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-white">{tool.title}</h3>
              <span className="aurora-pill rounded-full px-3 py-1 text-[11px] font-medium">
                {tool.status}
              </span>
            </div>
            <p className="mt-3 text-sm leading-7 text-cyan-50/82">{tool.body}</p>
            <Link
              href={tool.href}
              className="aurora-secondary-button mt-5 inline-flex rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Open {tool.title}
            </Link>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
