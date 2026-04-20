import { AppShell } from '@/components/layout/app-shell';
import { ReviewWorkspace } from '@/components/note/review-workspace';

export default function ReviewPage() {
  return (
    <AppShell
      title="Review and Finish"
      subtitle="Use the full review surface when you want a dedicated, high-visibility pass across source support, psych-sensitive wording, and export readiness."
    >
      <ReviewWorkspace />
    </AppShell>
  );
}
