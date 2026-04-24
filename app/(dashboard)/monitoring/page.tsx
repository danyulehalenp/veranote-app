import { AppShell } from '@/components/layout/app-shell';
import { MonitoringDashboard } from '@/components/monitoring/monitoring-dashboard';

export default function MonitoringPage() {
  return (
    <AppShell
      title="Monitoring"
      subtitle="Keep request health, regression performance, backend usage, and recent failures in one sanitized operational view."
      fullWidth
      showFeedback={false}
    >
      <MonitoringDashboard />
    </AppShell>
  );
}
