import { NextResponse } from 'next/server';
import { REWRITE_MODES, rewriteNote, type RewriteMode } from '@/lib/ai/rewrite-note';

function normalizeRewriteMode(value: unknown): RewriteMode {
  return typeof value === 'string' && (REWRITE_MODES as readonly string[]).includes(value)
    ? value as RewriteMode
    : 'regenerate-full-note';
}

export async function POST(request: Request) {
  const body = await request.json();
  const currentDraft = typeof body?.currentDraft === 'string' ? body.currentDraft : '';
  const sourceInput = typeof body?.sourceInput === 'string' ? body.sourceInput : '';
  const noteType = typeof body?.noteType === 'string' ? body.noteType : 'Psychiatry Follow-Up';
  const rewriteMode = normalizeRewriteMode(body?.rewriteMode);

  if (!currentDraft.trim() && rewriteMode !== 'regenerate-full-note') {
    return NextResponse.json({ error: 'Current draft is required for this rewrite action.' }, { status: 400 });
  }

  if (!sourceInput.trim()) {
    return NextResponse.json({ error: 'Source input is required.' }, { status: 400 });
  }

  const result = await rewriteNote({
    sourceInput,
    currentDraft,
    noteType,
    rewriteMode,
  });

  return NextResponse.json(result);
}
