import { betaCohortSlots, getBetaWorkflowById, supportedBetaWorkflows } from '@/lib/constants/provider-beta';

export function ProviderBetaOperationsPanel() {
  return (
    <section className="aurora-panel rounded-[28px] p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Trusted-provider beta operations</h2>
          <p className="mt-1 text-sm text-muted">
            Internal beta planning for the first provider wave. This keeps the cohort, supported workflows, and first-pass sequencing visible inside the prototype without turning beta ops into a separate platform.
          </p>
        </div>
        <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium text-muted">
          Internal only
        </div>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="aurora-soft-panel rounded-[22px] p-4">
          <h3 className="text-sm font-semibold text-ink">Supported beta workflows</h3>
          <div className="mt-3 grid gap-3">
            {supportedBetaWorkflows.map((workflow) => (
              <div key={workflow.id} className="aurora-soft-panel rounded-[18px] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-ink">{workflow.label}</div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wide ${
                    workflow.priority === 'Primary'
                      ? 'bg-emerald-100 text-emerald-900'
                      : 'bg-slate-100 text-slate-900'
                  }`}>
                    {workflow.priority}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {workflow.noteTypes.map((noteType) => (
                    <span key={noteType} className="aurora-pill rounded-full px-3 py-1 text-xs font-medium text-slate-700">
                      {noteType}
                    </span>
                  ))}
                </div>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Review focus</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {workflow.reviewFocus.map((item) => (
                    <span key={item} className="aurora-pill rounded-full px-3 py-1 text-xs text-slate-700">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="aurora-soft-panel rounded-[22px] p-4">
          <h3 className="text-sm font-semibold text-ink">First-wave cohort slots</h3>
          <div className="mt-3 space-y-3">
            {betaCohortSlots.map((slot, index) => (
              <div key={slot.id} className="aurora-soft-panel rounded-[18px] p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-ink">{slot.label}</div>
                  <span className="aurora-pill rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-700">
                    {index < 3 ? 'Start early' : 'Second wave'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">{slot.targetRole}</p>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Assigned workflows</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...slot.primaryWorkflowIds, ...slot.secondaryWorkflowIds].map((workflowId) => (
                    <span key={workflowId} className="aurora-pill rounded-full px-3 py-1 text-xs text-slate-700">
                      {getBetaWorkflowById(workflowId)?.label ?? workflowId}
                    </span>
                  ))}
                </div>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Biggest risk</div>
                <p className="mt-1 text-sm text-slate-700">{slot.biggestRisk}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="aurora-soft-panel rounded-[22px] p-4">
          <h3 className="text-sm font-semibold text-ink">First session sequence</h3>
          <ol className="mt-3 space-y-2 text-sm text-slate-700">
            <li>1. Confirm de-identified or safely abstracted source material.</li>
            <li>2. Test one primary workflow first.</li>
            <li>3. Go through `New Note` then `Review` then `Export`.</li>
            <li>4. Capture feedback immediately after the case.</li>
          </ol>
        </div>

        <div className="aurora-soft-panel rounded-[22px] p-4">
          <h3 className="text-sm font-semibold text-ink">What to capture</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {['usefulness', 'trust', 'review burden', 'reuse likelihood', 'strongest concern', 'issue category'].map((item) => (
              <span key={item} className="aurora-pill rounded-full px-3 py-1 text-xs text-slate-700">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="aurora-soft-panel rounded-[22px] p-4">
          <h3 className="text-sm font-semibold text-ink">Operational rule</h3>
          <p className="mt-3 text-sm text-slate-700">
            Do not broaden the beta wave just because the structure now exists. Keep the first cohort small, supported-workflow only, and disciplined about feedback capture.
          </p>
        </div>
      </div>
    </section>
  );
}
