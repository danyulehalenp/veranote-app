import { NextResponse } from 'next/server';
import { listNotePresets, saveNotePresets } from '@/lib/db/client';
import type { NotePreset } from '@/lib/note/presets';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const providerId = searchParams.get('providerId') || undefined;
  const presets = await listNotePresets(providerId);
  return NextResponse.json({ presets });
}

export async function POST(request: Request) {
  const body = await request.json() as { presets?: NotePreset[]; providerId?: string };
  const presets = Array.isArray(body?.presets) ? body.presets as NotePreset[] : null;
  const providerId = body.providerId;

  if (!presets) {
    return NextResponse.json({ error: 'Preset array is required.' }, { status: 400 });
  }

  const saved = await saveNotePresets(presets, providerId);
  return NextResponse.json({ presets: saved });
}
