import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
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
    >
      <BetaFeedbackInbox feedback={feedback} />
    </AppShell>
  );
}
