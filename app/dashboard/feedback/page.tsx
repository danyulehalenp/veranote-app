import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { InternalSurfaceNotice } from '@/components/layout/internal-surface-notice';
import { BetaFeedbackInbox } from '@/components/veranote/feedback/beta-feedback-inbox';
import { listBetaFeedback } from '@/lib/db/client';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

export const dynamic = 'force-dynamic';

export default async function FeedbackPage() {
  if (!INTERNAL_MODE_ENABLED) {
    redirect('/');
  }

  const feedback = await listBetaFeedback();

  return (
    <AppShell
      title="Feedback Inbox"
      subtitle="Review beta feedback, mark what needs regression coverage, and copy a safe scaffold for Atlas Lab follow-up."
      fullWidth
    >
      <InternalSurfaceNotice body="This inbox is an internal beta triage surface. Providers should submit in-flow feedback from the note builder or Atlas response area rather than use this page directly." />
      <BetaFeedbackInbox feedback={feedback} />
    </AppShell>
  );
}
