import { NextResponse } from 'next/server';
import { listNotePresets, saveNotePresets } from '@/lib/db/client';
import type { NotePreset } from '@/lib/note/presets';
import { getAuthorizedProviderContext, resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';

export async function GET(request: Request) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerId = resolveScopedProviderIdentityId(searchParams.get('providerId') || undefined, authorizedProvider.providerIdentityId);
  const presets = await listNotePresets(providerId);
  return NextResponse.json({ presets });
}

export async function POST(request: Request) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as { presets?: NotePreset[]; providerId?: string };
  const presets = Array.isArray(body?.presets) ? body.presets as NotePreset[] : null;
  const providerId = resolveScopedProviderIdentityId(body.providerId, authorizedProvider.providerIdentityId);

  if (!presets) {
    return NextResponse.json({ error: 'Preset array is required.' }, { status: 400 });
  }

  const saved = await saveNotePresets(presets, providerId);
  return NextResponse.json({ presets: saved });
}
