import Link from 'next/link';
import { betaCohortSlots, supportedBetaWorkflows } from '@/lib/constants/provider-beta';
import { summarizeBetaFeedbackReadiness } from '@/lib/beta/feedback';

export function ProviderBetaReadinessStrip() {
  const readiness = summarizeBetaFeedbackReadiness();

  return (
    <section className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Phase 3</div>
          <h2 className="mt-2 text-lg font-semibold text-emerald-950">Trusted-provider beta readiness</h2>
          <p className="mt-2 text-sm text-emerald-900">
            Veranote now has the beta plan, cohort slots, onboarding, feedback structure, and issue logging needed to start a small trusted-provider loop without pretending this is a broad release.
          </p>
        </div>
        <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-900">
          Active phase
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-emerald-100 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Supported workflows</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-950">{supportedBetaWorkflows.length}</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Cohort slots</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-950">{betaCohortSlots.length}</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Feedback categories</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-950">{readiness.feedbackCategoryCount}</div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Artifacts ready</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-950">6</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/dashboard/templates" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
          Open beta operations
        </Link>
        <Link href="/dashboard/examples" className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-950">
          View beta-supported examples
        </Link>
      </div>
    </section>
  );
}
