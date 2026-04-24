import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { recordAuditEvent } from '@/lib/audit/audit-log';
import { logEvent } from '@/lib/security/safe-logger';
import { deleteMemory, getMemory } from '@/lib/veranote/memory/memory-store';
import { resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  let authContext;
  try {
    authContext = await requireAuth(request);
  } catch {
    logEvent({
      route: 'assistant/memory/[id]',
      action: 'auth_failed',
      outcome: 'rejected',
      status: 401,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerId = resolveScopedProviderIdentityId(searchParams.get('providerId') || undefined, authContext.providerIdentityId || authContext.user.id);
  const { id } = await context.params;
  const deleted = await deleteMemory(id, providerId);

  if (!deleted) {
    logEvent({
      route: 'assistant/memory/[id]',
      userId: authContext.user.id,
      action: 'memory_delete',
      outcome: 'rejected',
      status: 404,
      metadata: {
        providerId,
      },
    });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  logEvent({
    route: 'assistant/memory/[id]',
    userId: authContext.user.id,
    action: 'memory_delete',
    outcome: 'success',
    status: 200,
    metadata: {
      providerId,
    },
  });
  recordAuditEvent({
    userId: authContext.user.id,
    action: 'memory_delete',
    route: 'assistant/memory/[id]',
    metadata: {
      providerId,
    },
  });

  return NextResponse.json({ deleted: true, providerMemory: await getMemory(providerId) });
}
