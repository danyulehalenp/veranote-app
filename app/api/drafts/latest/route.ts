import { NextResponse } from 'next/server';
import { getLatestDraft } from '@/lib/db/client';

export async function GET() {
  const draft = await getLatestDraft();
  return NextResponse.json({ draft });
}
