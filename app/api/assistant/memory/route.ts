import { NextResponse } from 'next/server';
import { getAssistantLearning, getVeraMemoryLedger, saveAssistantLearning } from '@/lib/db/client';
import { createEmptyAssistantLearningStore, type AssistantLearningStore } from '@/lib/veranote/assistant-learning';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const providerId = searchParams.get('providerId') || undefined;
  const learningStore = await getAssistantLearning(providerId);
  const veraMemoryLedger = await getVeraMemoryLedger(providerId);
  return NextResponse.json({ learningStore, veraMemoryLedger });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    providerId?: string;
    learningStore?: AssistantLearningStore;
  };

  const learningStore = await saveAssistantLearning({
    ...createEmptyAssistantLearningStore(),
    ...(body.learningStore || {}),
  }, body.providerId);
  const veraMemoryLedger = await getVeraMemoryLedger(body.providerId);

  return NextResponse.json({ learningStore, veraMemoryLedger });
}
