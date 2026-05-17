import { AppShell } from '@/components/layout/app-shell';
import { ConnectivityStatusDashboard } from '@/components/monitoring/connectivity-status-dashboard';

export default function ConnectivityPage() {
  return (
    <AppShell
      title="Connectivity Status"
      subtitle="Check whether Veranote is connected to durable storage, auth, AI configuration, and the core Supabase tables needed for production persistence."
      fullWidth
      showFeedback={false}
    >
      <ConnectivityStatusDashboard />
    </AppShell>
  );
}
