import { AppShell } from '@/components/layout/app-shell';
import { DictationHistoryDashboard } from '@/components/note/dictation-history-dashboard';

export default function DictationHistoryPage() {
  return (
    <AppShell
      title="Dictation History"
      subtitle="Inspect saved dictation sessions, flagged runs, and full event trails without depending on the active compose session still being open."
      fullWidth
    >
      <DictationHistoryDashboard />
    </AppShell>
  );
}
