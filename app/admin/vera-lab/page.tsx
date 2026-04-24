import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { InternalSurfaceNotice } from '@/components/layout/internal-surface-notice';
import { VeraLabDashboard } from '@/components/admin/vera-lab-dashboard';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

export default function VeraLabPage() {
  if (!INTERNAL_MODE_ENABLED) {
    redirect('/');
  }

  return (
    <AppShell
      title="Vera Lab"
      subtitle="Internal QA surface for interrogating the live Vera endpoint, classifying failures, routing repair tasks, and gating regressions before changes ship."
      fullWidth
      showFeedback={false}
    >
      <InternalSurfaceNotice
        title="Internal admin surface"
        body="Vera Lab is for internal QA, failure analysis, repair routing, and regression gating. It should stay isolated from the provider-facing workflow."
      />
      <div className="mt-6">
        <VeraLabDashboard />
      </div>
    </AppShell>
  );
}
