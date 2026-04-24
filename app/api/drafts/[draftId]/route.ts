import { NextResponse } from 'next/server';
import { archiveDraft, deleteDraft, getDraftById, markDraftOpened, restoreDraft } from '@/lib/db/client';
import type { DraftRecoveryState } from '@/types/session';
import { getAuthorizedProviderContext, resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';

type DraftRouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

export async function GET(request: Request, context: DraftRouteContext) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { draftId } = await context.params;
  const { searchParams } = new URL(request.url);
  const providerId = resolveScopedProviderIdentityId(searchParams.get('providerId') || undefined, authorizedProvider.providerIdentityId);
  const includeArchived = searchParams.get('includeArchived') === 'true';
  const draft = await getDraftById(draftId, providerId, { includeArchived });

  if (!draft) {
    return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
  }

  return NextResponse.json({ draft });
}

export async function PATCH(request: Request, context: DraftRouteContext) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { draftId } = await context.params;
  const body = (await request.json()) as {
    action?: 'archive' | 'restore' | 'mark-opened';
    providerId?: string;
    recoveryState?: DraftRecoveryState;
  };
  const providerId = resolveScopedProviderIdentityId(body.providerId, authorizedProvider.providerIdentityId);

  if (body.action === 'archive') {
    const draft = await archiveDraft(draftId, providerId);
    if (!draft) {
      return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
    }

    return NextResponse.json({ draft });
  }

  if (body.action === 'restore') {
    const draft = await restoreDraft(draftId, providerId);
    if (!draft) {
      return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
    }

    return NextResponse.json({ draft });
  }

  if (body.action === 'mark-opened') {
    const draft = await markDraftOpened(draftId, providerId, body.recoveryState);
    if (!draft) {
      return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
    }

    return NextResponse.json({ draft });
  }

  return NextResponse.json({ error: 'Unsupported draft action.' }, { status: 400 });
}

export async function DELETE(request: Request, context: DraftRouteContext) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { draftId } = await context.params;
  const { searchParams } = new URL(request.url);
  const providerId = resolveScopedProviderIdentityId(searchParams.get('providerId') || undefined, authorizedProvider.providerIdentityId);
  const deleted = await deleteDraft(draftId, providerId);

  if (!deleted) {
    return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
