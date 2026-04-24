import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { InternalSurfaceNotice } from '@/components/layout/internal-surface-notice';
import { FidelityEvalPanel } from '@/components/eval/fidelity-eval-panel';
import { EvalBatchRunner } from '@/components/eval/eval-batch-runner';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

export default function EvalPage() {
  if (!INTERNAL_MODE_ENABLED) {
    redirect('/');
  }

  return (
    <AppShell
      title="Fidelity Evaluation"
      subtitle="Use a focused starter set of failure-prone cases to evaluate whether the app preserves meaning, avoids invention, and flags gaps instead of hallucinating confidence."
    >
      <div className="grid gap-6">
        <InternalSurfaceNotice body="This evaluation runner is for internal trust and regression work. It helps improve Veranote, but it is not part of the daily provider note workflow." />
        <EvalBatchRunner />
        <FidelityEvalPanel />
      </div>
    </AppShell>
  );
}
