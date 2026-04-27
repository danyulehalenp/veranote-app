import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { VeraLabRunDetailView } from '@/components/admin/vera-lab-run-detail';
import { AppShell } from '@/components/layout/app-shell';
import { InternalSurfaceNotice } from '@/components/layout/internal-surface-notice';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { requireRole } from '@/lib/auth/role-check';
import { getVeraLabRunDetail } from '@/lib/db/vera-lab-repo';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';
import type { VeraLabRunDetailSort } from '@/lib/veranote/lab/types';

async function requireAdminPageAccess() {
  const incomingHeaders = await headers();
  const host = incomingHeaders.get('host') || 'localhost';
  const protocol = incomingHeaders.get('x-forwarded-proto') || 'http';
  const requestHeaders = new Headers();

  const authorization = incomingHeaders.get('authorization') || incomingHeaders.get('Authorization');
  const cookie = incomingHeaders.get('cookie');

  if (authorization) {
    requestHeaders.set('authorization', authorization);
  }

  if (cookie) {
    requestHeaders.set('cookie', cookie);
  }

  const authContext = await requireAuth(new Request(`${protocol}://${host}/admin/vera-lab`, {
    headers: requestHeaders,
  }));
  requireRole(authContext.user, 'admin');
}

export default async function VeraLabRunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!INTERNAL_MODE_ENABLED) {
    redirect('/');
  }

  try {
    await requireAdminPageAccess();
  } catch {
    redirect('/');
  }

  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const detail = await getVeraLabRunDetail(id);

  if (!detail) {
    notFound();
  }

  const toBoolean = (value: string | string[] | undefined) => {
    const raw = Array.isArray(value) ? value[0] : value;
    return raw === '1' || raw === 'true';
  };

  const focusCaseId = (() => {
    const raw = resolvedSearchParams.focusCase;
    return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : null;
  })();

  const initialSearchQuery = (() => {
    const raw = resolvedSearchParams.q;
    return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  })();

  const initialSort = (() => {
    const raw = resolvedSearchParams.sort;
    const value = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : 'stored';
    const allowed: VeraLabRunDetailSort[] = ['stored', 'failure-first', 'severity', 'category'];
    return allowed.includes(value as VeraLabRunDetailSort) ? (value as VeraLabRunDetailSort) : 'stored';
  })();

  return (
    <AppShell
      title="Atlas Lab Run Detail"
      subtitle="Inspect one persisted Atlas Lab batch in full so routing failures, wording misses, repair tasks, and regression outcomes can be reviewed without digging through raw tables."
      fullWidth
      showFeedback={false}
    >
      <InternalSurfaceNotice
        title="Internal admin run inspection"
        body="This view is for internal QA review only. It exposes the full persisted chain for a single Atlas Lab batch: case definition, judged result, linked repair task, and regression outcomes."
      />
      <VeraLabRunDetailView
        detail={detail}
        initialFilters={{
          failedOnly: toBoolean(resolvedSearchParams.failedOnly),
          highSeverityOnly: toBoolean(resolvedSearchParams.highSeverityOnly),
          routingFailuresOnly: toBoolean(resolvedSearchParams.routingFailuresOnly),
          answerModeFailuresOnly: toBoolean(resolvedSearchParams.answerModeFailuresOnly),
        }}
        focusCaseId={focusCaseId}
        initialSearchQuery={initialSearchQuery}
        initialSort={initialSort}
      />
    </AppShell>
  );
}
