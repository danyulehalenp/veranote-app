import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { InternalSurfaceNotice } from '@/components/layout/internal-surface-notice';
import { EvalResultsHistory } from '@/components/eval/eval-results-history';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

export default function EvalResultsPage() {
  if (!INTERNAL_MODE_ENABLED) {
    redirect('/');
  }

  return (
    <AppShell
      title="Evaluation Results"
      subtitle="Review saved scorecards, output snapshots, flags, and overall ratings across evaluated cases."
    >
      <InternalSurfaceNotice body="These saved evaluation artifacts are for internal measurement and product tuning. They should not be treated as part of the provider-facing workflow." />
      <EvalResultsHistory />
    </AppShell>
  );
}
