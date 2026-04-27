import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { InternalSurfaceNotice } from '@/components/layout/internal-surface-notice';
import { BetaFeedbackInbox } from '@/components/veranote/feedback/beta-feedback-inbox';
import { listBetaFeedback } from '@/lib/db/client';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

export const dynamic = 'force-dynamic';

export default async function AdminBetaFeedbackPage() {
  if (!INTERNAL_MODE_ENABLED) {
    redirect('/');
  }

  const feedback = await listBetaFeedback();

  return (
    <AppShell
      title="Beta Feedback Admin"
      subtitle="Review PHI-safe beta feedback, update triage status, and prepare regression scaffolds for manual Atlas Lab review."
      fullWidth
    >
      <InternalSurfaceNotice body="This page is for internal beta triage only. Do not paste raw patient identifiers into admin notes or regression scaffolds." />
      <BetaFeedbackInbox feedback={feedback} />
    </AppShell>
  );
}
