import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { recordAuditEvent } from '@/lib/audit/audit-log';
import { getAssistantLearning, getVeraMemoryLedger, saveAssistantLearning } from '@/lib/db/client';
import { validateRequest } from '@/lib/security/request-guard';
import { logEvent } from '@/lib/security/safe-logger';
import { createEmptyAssistantLearningStore, type AssistantLearningStore } from '@/lib/veranote/assistant-learning';
import { addMemory, getMemory, updateMemory } from '@/lib/veranote/memory/memory-store';
import type { ProviderMemoryItem } from '@/lib/veranote/memory/memory-types';
import { resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';

function nowIso() {
  return new Date().toISOString();
}

function normalizeTags(tags?: string[]) {
  return [...new Set((tags || []).map((tag) => tag.trim()).filter(Boolean))];
}

function buildMemoryItem(input: Partial<ProviderMemoryItem>, providerId: string): ProviderMemoryItem {
  const timestamp = nowIso();
  return {
    id: input.id || `provider-memory:${crypto.randomUUID()}`,
    providerId,
    category: input.category || 'style',
    content: (input.content || '').trim(),
    tags: normalizeTags(input.tags),
    confidence: input.confidence || 'low',
    source: input.source || 'manual',
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

export async function GET(request: Request) {
  let authContext;
  try {
    authContext = await requireAuth(request);
  } catch {
    logEvent({
      route: 'assistant/memory',
      action: 'auth_failed',
      outcome: 'rejected',
      status: 401,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerId = resolveScopedProviderIdentityId(searchParams.get('providerId') || undefined, authContext.providerIdentityId || authContext.user.id);
  const learningStore = await getAssistantLearning(providerId);
  const veraMemoryLedger = await getVeraMemoryLedger(providerId);
  const providerMemory = await getMemory(providerId);
  logEvent({
    route: 'assistant/memory',
    userId: authContext.user.id,
    action: 'memory_read',
    outcome: 'success',
    status: 200,
    metadata: {
      providerId,
      providerMemoryCount: providerMemory.length,
    },
  });
  recordAuditEvent({
    userId: authContext.user.id,
    action: 'memory_read',
    route: 'assistant/memory',
    metadata: {
      providerId,
    },
  });
  return NextResponse.json({ learningStore, veraMemoryLedger, providerMemory });
}

export async function POST(request: Request) {
  let authContext;
  try {
    authContext = await requireAuth(request);
  } catch {
    logEvent({
      route: 'assistant/memory',
      action: 'auth_failed',
      outcome: 'rejected',
      status: 401,
    });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    providerId?: string;
    learningStore?: AssistantLearningStore;
    memoryItem?: Partial<ProviderMemoryItem>;
  };
  try {
    body = (await request.json()) as {
      providerId?: string;
      learningStore?: AssistantLearningStore;
      memoryItem?: Partial<ProviderMemoryItem>;
    };
    validateRequest(body as unknown as Record<string, unknown>);
  } catch {
    logEvent({
      route: 'assistant/memory',
      userId: authContext.user.id,
      action: 'request_rejected',
      outcome: 'rejected',
      status: 400,
    });
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const providerId = resolveScopedProviderIdentityId(body.providerId, authContext.providerIdentityId || authContext.user.id);

  if (body.memoryItem) {
    const memoryItem = buildMemoryItem(body.memoryItem, providerId);
    const savedMemory = body.memoryItem.id
      ? (await updateMemory(memoryItem)) || await addMemory(memoryItem)
      : await addMemory(memoryItem);
    logEvent({
      route: 'assistant/memory',
      userId: authContext.user.id,
      action: body.memoryItem.id ? 'memory_update' : 'memory_create',
      outcome: 'success',
      status: 200,
      metadata: {
        providerId,
        category: memoryItem.category,
      },
    });
    recordAuditEvent({
      userId: authContext.user.id,
      action: body.memoryItem.id ? 'memory_update' : 'memory_write',
      route: 'assistant/memory',
      metadata: {
        providerId,
        category: memoryItem.category,
      },
    });
    return NextResponse.json({ memoryItem: savedMemory, providerMemory: await getMemory(providerId) });
  }

  const learningStore = await saveAssistantLearning({
    ...createEmptyAssistantLearningStore(),
    ...(body.learningStore || {}),
  }, providerId);
  const veraMemoryLedger = await getVeraMemoryLedger(providerId);
  const providerMemory = await getMemory(providerId);
  logEvent({
    route: 'assistant/memory',
    userId: authContext.user.id,
    action: 'learning_store_update',
    outcome: 'success',
    status: 200,
    metadata: {
      providerId,
    },
  });
  recordAuditEvent({
    userId: authContext.user.id,
    action: 'memory_write',
    route: 'assistant/memory',
    metadata: {
      providerId,
      type: 'learning-store',
    },
  });

  return NextResponse.json({ learningStore, veraMemoryLedger, providerMemory });
}
