import { TopNav } from '@/components/layout/top-nav';
import { AssistantShell } from '@/components/veranote/assistant/assistant-shell';
import { BetaFeedbackPanel } from '@/components/veranote/feedback/beta-feedback-panel';

export function AppShell({
  title,
  subtitle,
  children,
  hidePageHeader = false,
  fullWidth = false,
  showFeedback = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  hidePageHeader?: boolean;
  fullWidth?: boolean;
  showFeedback?: boolean;
}) {
  return (
    <div className="veranote-theme min-h-screen">
      <TopNav />
      <AssistantShell />
      <main className={fullWidth ? 'w-full px-3 py-6 md:px-4 lg:px-5' : 'mx-auto max-w-7xl px-6 py-8'}>
        {!hidePageHeader ? (
          <div className="aurora-hero mb-8 overflow-hidden rounded-[30px] px-6 py-7">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="aurora-pill rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]">
                Veranote workspace
              </span>
              <span className="aurora-pill rounded-full px-3 py-1 text-[11px] font-medium">
                Modern review-first documentation
              </span>
            </div>
            <h1 className="max-w-4xl text-4xl font-semibold text-ink md:text-5xl">{title}</h1>
            {subtitle ? <p className="mt-3 max-w-3xl text-base leading-7 text-muted">{subtitle}</p> : null}
          </div>
        ) : null}
        {children}
        {showFeedback ? (
          <div className="mt-8">
            <BetaFeedbackPanel pageContext={title} />
          </div>
        ) : null}
      </main>
    </div>
  );
}
