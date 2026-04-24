import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAuthorizedProviderContext = vi.fn();
const mockResolveScopedProviderIdentityId = vi.fn();
const mockGetAssistantLearning = vi.fn();
const mockGetVeraMemoryLedger = vi.fn();
const mockSaveAssistantLearning = vi.fn();
const memoryRepoState = new Map<string, any[]>();

vi.mock('@/lib/veranote/provider-session', () => ({
  getAuthorizedProviderContext: mockGetAuthorizedProviderContext,
  resolveScopedProviderIdentityId: mockResolveScopedProviderIdentityId,
}));

vi.mock('@/lib/db/client', () => ({
  getAssistantLearning: mockGetAssistantLearning,
  getVeraMemoryLedger: mockGetVeraMemoryLedger,
  saveAssistantLearning: mockSaveAssistantLearning,
}));

vi.mock('@/lib/db/memory-repo', () => ({
  getProviderMemory: vi.fn(async (providerId: string) => memoryRepoState.get(providerId) || []),
  saveProviderMemory: vi.fn(async (item: any) => {
    const bucket = memoryRepoState.get(item.providerId) || [];
    const nextBucket = bucket.some((existing) => existing.id === item.id)
      ? bucket.map((existing) => (existing.id === item.id ? item : existing))
      : [...bucket, item];
    memoryRepoState.set(item.providerId, nextBucket);
  }),
  deleteProviderMemory: vi.fn(async (id: string, providerId?: string) => {
    if (providerId) {
      const bucket = memoryRepoState.get(providerId) || [];
      memoryRepoState.set(providerId, bucket.filter((item) => item.id !== id));
      return true;
    }
    return true;
  }),
}));

describe('provider memory route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryRepoState.clear();
    mockGetAuthorizedProviderContext.mockResolvedValue({
      providerAccountId: 'account-daniel-hale-beta',
      providerIdentityId: 'provider-daniel-hale-beta',
    });
    mockResolveScopedProviderIdentityId.mockImplementation((_requestedProviderId, authorizedProviderId) => authorizedProviderId);
    mockGetAssistantLearning.mockResolvedValue({ rewritePreferencesByNoteType: {} });
    mockGetVeraMemoryLedger.mockResolvedValue({ items: [], generatedAt: '2026-04-21T00:00:00.000Z' });
    mockSaveAssistantLearning.mockResolvedValue({ rewritePreferencesByNoteType: {} });
  });

  it('adds, reads, and deletes provider-scoped style memory separately from the learning store', async () => {
    const memoryRoute = await import('@/app/api/assistant/memory/route');
    const deleteRoute = await import('@/app/api/assistant/memory/[id]/route');

    const createResponse = await memoryRoute.POST(new Request('http://localhost/api/assistant/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: 'provider-someone-else',
        memoryItem: {
          id: 'memory-route-1',
          category: 'style',
          content: 'Prefer visibly labeled section headers in note output.',
          tags: ['headers', 'Outpatient Psych Follow-Up'],
          confidence: 'medium',
          source: 'manual',
        },
      }),
    }));
    const createPayload = await createResponse.json();

    expect(createResponse.status).toBe(200);
    expect(mockResolveScopedProviderIdentityId).toHaveBeenCalledWith('provider-someone-else', 'provider-daniel-hale-beta');
    expect(createPayload.memoryItem.providerId).toBe('provider-daniel-hale-beta');
    expect(createPayload.providerMemory).toHaveLength(1);

    const readResponse = await memoryRoute.GET(new Request('http://localhost/api/assistant/memory?providerId=provider-someone-else'));
    const readPayload = await readResponse.json();

    expect(readResponse.status).toBe(200);
    expect(readPayload.providerMemory).toHaveLength(1);
    expect(readPayload.learningStore).toEqual({ rewritePreferencesByNoteType: {} });

    const deleteResponse = await deleteRoute.DELETE(new Request('http://localhost/api/assistant/memory/memory-route-1?providerId=provider-someone-else'), {
      params: Promise.resolve({ id: 'memory-route-1' }),
    });
    const deletePayload = await deleteResponse.json();

    expect(deleteResponse.status).toBe(200);
    expect(deletePayload.deleted).toBe(true);
    expect(deletePayload.providerMemory).toHaveLength(0);
  }, 15000);
});
