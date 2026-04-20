import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
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
      <EvalResultsHistory />
    </AppShell>
  );
}
