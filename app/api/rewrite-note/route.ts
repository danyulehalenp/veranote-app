import { NextResponse } from 'next/server';
import { rewriteNote } from '@/lib/ai/rewrite-note';

export async function POST(request: Request) {
  const body = await request.json();
  const currentDraft = typeof body?.currentDraft === 'string' ? body.currentDraft : '';
  const sourceInput = typeof body?.sourceInput === 'string' ? body.sourceInput : '';
  const noteType = typeof body?.noteType === 'string' ? body.noteType : 'Psychiatry Follow-Up';
  const rewriteMode = typeof body?.rewriteMode === 'string' ? body.rewriteMode : 'regenerate-full-note';

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
    rewriteMode: rewriteMode as 'more-concise' | 'more-formal' | 'closer-to-source' | 'regenerate-full-note',
  });

  return NextResponse.json(result);
}
