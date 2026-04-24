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
      subtitle="Review provider beta feedback in one place so workflow pain points, wording issues, and accessibility requests can be triaged daily."
      fullWidth
    >
      <InternalSurfaceNotice body="This inbox is an internal triage surface for reviewing provider feedback and Vera gaps. Providers should submit feedback from the in-flow Beta Feedback entry point rather than treat this page as part of their normal workflow." />
      <BetaFeedbackInbox feedback={feedback} />
    </AppShell>
  );
}
