import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAuthorizedProviderContext = vi.fn();
const mockResolveScopedProviderIdentityId = vi.fn();
const mockGetProviderSettings = vi.fn();
const mockSaveProviderSettings = vi.fn();
const mockListNotePresets = vi.fn();
const mockSaveNotePresets = vi.fn();
const mockGetAssistantLearning = vi.fn();
const mockGetVeraMemoryLedger = vi.fn();
const mockSaveAssistantLearning = vi.fn();
const mockListDrafts = vi.fn();
const mockSaveDraft = vi.fn();
const mockGetLatestDraft = vi.fn();
const mockArchiveDraft = vi.fn();
const mockRestoreDraft = vi.fn();
const mockDeleteDraft = vi.fn();
const mockMarkDraftOpened = vi.fn();

vi.mock('@/lib/veranote/provider-session', () => ({
  getAuthorizedProviderContext: mockGetAuthorizedProviderContext,
  resolveScopedProviderIdentityId: mockResolveScopedProviderIdentityId,
}));

vi.mock('@/lib/db/client', () => ({
  getProviderSettings: mockGetProviderSettings,
  saveProviderSettings: mockSaveProviderSettings,
  listNotePresets: mockListNotePresets,
  saveNotePresets: mockSaveNotePresets,
  getAssistantLearning: mockGetAssistantLearning,
  getVeraMemoryLedger: mockGetVeraMemoryLedger,
  saveAssistantLearning: mockSaveAssistantLearning,
  listDrafts: mockListDrafts,
  saveDraft: mockSaveDraft,
  getLatestDraft: mockGetLatestDraft,
  archiveDraft: mockArchiveDraft,
  restoreDraft: mockRestoreDraft,
  deleteDraft: mockDeleteDraft,
  markDraftOpened: mockMarkDraftOpened,
}));

describe('provider data isolation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthorizedProviderContext.mockResolvedValue({
      providerAccountId: 'account-daniel-hale-beta',
      providerIdentityId: 'provider-daniel-hale-beta',
    });
    mockResolveScopedProviderIdentityId.mockImplementation((_requestedProviderId, authorizedProviderId) => authorizedProviderId);
  });

  it('keeps provider settings reads scoped to the signed-in provider', async () => {
    mockGetProviderSettings.mockResolvedValue({ providerProfileId: 'profile-daniel' });

    const { GET } = await import('@/app/api/settings/provider/route');
    const response = await GET(new Request('http://localhost/api/settings/provider?providerId=provider-stacey-creel-beta'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockResolveScopedProviderIdentityId).toHaveBeenCalledWith('provider-stacey-creel-beta', 'provider-daniel-hale-beta');
    expect(mockGetProviderSettings).toHaveBeenCalledWith('provider-daniel-hale-beta');
    expect(payload.settings).toEqual({ providerProfileId: 'profile-daniel' });
  });

  it('keeps provider settings writes scoped to the signed-in provider', async () => {
    mockSaveProviderSettings.mockResolvedValue({ providerProfileId: 'profile-daniel' });

    const { POST } = await import('@/app/api/settings/provider/route');
    const response = await POST(new Request('http://localhost/api/settings/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: 'provider-stacey-creel-beta',
        providerProfileId: 'profile-daniel',
      }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockResolveScopedProviderIdentityId).toHaveBeenCalledWith('provider-stacey-creel-beta', 'provider-daniel-hale-beta');
    expect(mockSaveProviderSettings).toHaveBeenCalledWith(expect.objectContaining({
      providerProfileId: 'profile-daniel',
    }), 'provider-daniel-hale-beta');
    expect(payload.settings).toEqual({ providerProfileId: 'profile-daniel' });
  });

  it('keeps preset reads and writes scoped to the signed-in provider', async () => {
    mockListNotePresets.mockResolvedValue([{ id: 'preset-daniel', name: 'Daniel Preset' }]);
    mockSaveNotePresets.mockResolvedValue([{ id: 'preset-daniel', name: 'Daniel Preset' }]);

    const presetsRoute = await import('@/app/api/presets/route');
    const readResponse = await presetsRoute.GET(new Request('http://localhost/api/presets?providerId=provider-stacey-creel-beta'));
    const readPayload = await readResponse.json();

    expect(readResponse.status).toBe(200);
    expect(mockResolveScopedProviderIdentityId).toHaveBeenCalledWith('provider-stacey-creel-beta', 'provider-daniel-hale-beta');
    expect(mockListNotePresets).toHaveBeenCalledWith('provider-daniel-hale-beta');
    expect(readPayload.presets).toEqual([{ id: 'preset-daniel', name: 'Daniel Preset' }]);

    const writeResponse = await presetsRoute.POST(new Request('http://localhost/api/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: 'provider-stacey-creel-beta',
        presets: [{ id: 'preset-daniel', name: 'Daniel Preset' }],
      }),
    }));
    const writePayload = await writeResponse.json();

    expect(writeResponse.status).toBe(200);
    expect(mockSaveNotePresets).toHaveBeenCalledWith([{ id: 'preset-daniel', name: 'Daniel Preset' }], 'provider-daniel-hale-beta');
    expect(writePayload.presets).toEqual([{ id: 'preset-daniel', name: 'Daniel Preset' }]);
  });

  it('keeps Vera memory reads and writes scoped to the signed-in provider', async () => {
    mockGetAssistantLearning.mockResolvedValue({ rewritePreferencesByNoteType: {} });
    mockGetVeraMemoryLedger.mockResolvedValue({ items: [], generatedAt: '2026-04-20T00:00:00.000Z' });
    mockSaveAssistantLearning.mockResolvedValue({ rewritePreferencesByNoteType: {} });

    const memoryRoute = await import('@/app/api/assistant/memory/route');
    const readResponse = await memoryRoute.GET(new Request('http://localhost/api/assistant/memory?providerId=provider-stacey-creel-beta'));
    const readPayload = await readResponse.json();

    expect(readResponse.status).toBe(200);
    expect(mockResolveScopedProviderIdentityId).toHaveBeenCalledWith('provider-stacey-creel-beta', 'provider-daniel-hale-beta');
    expect(mockGetAssistantLearning).toHaveBeenCalledWith('provider-daniel-hale-beta');
    expect(mockGetVeraMemoryLedger).toHaveBeenCalledWith('provider-daniel-hale-beta');
    expect(readPayload.learningStore).toEqual({ rewritePreferencesByNoteType: {} });

    const writeResponse = await memoryRoute.POST(new Request('http://localhost/api/assistant/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: 'provider-stacey-creel-beta',
        learningStore: {
          rewritePreferencesByNoteType: {
            'Inpatient Psych Progress Note': {
              balanced: 2,
            },
          },
        },
      }),
    }));
    const writePayload = await writeResponse.json();

    expect(writeResponse.status).toBe(200);
    expect(mockSaveAssistantLearning).toHaveBeenCalledWith(expect.objectContaining({
      rewritePreferencesByNoteType: expect.objectContaining({
        'Inpatient Psych Progress Note': expect.objectContaining({
          balanced: 2,
        }),
      }),
    }), 'provider-daniel-hale-beta');
    expect(mockGetVeraMemoryLedger).toHaveBeenLastCalledWith('provider-daniel-hale-beta');
    expect(writePayload.veraMemoryLedger).toEqual({ items: [], generatedAt: '2026-04-20T00:00:00.000Z' });
  });

  it('keeps draft reads and writes scoped to the signed-in provider', async () => {
    mockListDrafts.mockResolvedValue([{ id: 'draft-daniel', providerIdentityId: 'provider-daniel-hale-beta' }]);
    mockSaveDraft.mockResolvedValue({ id: 'draft-daniel', providerIdentityId: 'provider-daniel-hale-beta', version: 2 });

    const draftsRoute = await import('@/app/api/drafts/route');
    const readResponse = await draftsRoute.GET(new Request('http://localhost/api/drafts?providerId=provider-stacey-creel-beta&includeArchived=true'));
    const readPayload = await readResponse.json();

    expect(readResponse.status).toBe(200);
    expect(mockResolveScopedProviderIdentityId).toHaveBeenCalledWith('provider-stacey-creel-beta', 'provider-daniel-hale-beta');
    expect(mockListDrafts).toHaveBeenCalledWith('provider-daniel-hale-beta', { includeArchived: true });
    expect(readPayload.drafts).toEqual([{ id: 'draft-daniel', providerIdentityId: 'provider-daniel-hale-beta' }]);

    const writeResponse = await draftsRoute.POST(new Request('http://localhost/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: 'provider-stacey-creel-beta',
        sourceInput: 'source',
        note: 'note',
        noteType: 'Inpatient Psych Progress Note',
      }),
    }));
    const writePayload = await writeResponse.json();

    expect(writeResponse.status).toBe(200);
    expect(mockSaveDraft).toHaveBeenCalledWith(expect.objectContaining({
      providerIdentityId: 'provider-daniel-hale-beta',
      sourceInput: 'source',
      note: 'note',
    }), 'provider-daniel-hale-beta');
    expect(writePayload.draft).toEqual({ id: 'draft-daniel', providerIdentityId: 'provider-daniel-hale-beta', version: 2 });
  });

  it('keeps latest draft restore and draft actions scoped to the signed-in provider', async () => {
    mockGetLatestDraft.mockResolvedValue({ id: 'draft-daniel', providerIdentityId: 'provider-daniel-hale-beta' });
    mockArchiveDraft.mockResolvedValue({ id: 'draft-daniel', archivedAt: '2026-04-21T00:00:00.000Z' });
    mockRestoreDraft.mockResolvedValue({ id: 'draft-daniel', archivedAt: undefined });
    mockMarkDraftOpened.mockResolvedValue({ id: 'draft-daniel', lastOpenedAt: '2026-04-21T00:00:00.000Z' });
    mockDeleteDraft.mockResolvedValue(true);

    const latestRoute = await import('@/app/api/drafts/latest/route');
    const latestResponse = await latestRoute.GET(new Request('http://localhost/api/drafts/latest?providerId=provider-stacey-creel-beta'));
    const latestPayload = await latestResponse.json();

    expect(latestResponse.status).toBe(200);
    expect(mockGetLatestDraft).toHaveBeenCalledWith('provider-daniel-hale-beta');
    expect(latestPayload.draft).toEqual({ id: 'draft-daniel', providerIdentityId: 'provider-daniel-hale-beta' });

    const draftActionsRoute = await import('@/app/api/drafts/[draftId]/route');
    const archiveResponse = await draftActionsRoute.PATCH(new Request('http://localhost/api/drafts/draft-daniel', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'archive', providerId: 'provider-stacey-creel-beta' }),
    }), { params: Promise.resolve({ draftId: 'draft-daniel' }) });
    expect(archiveResponse.status).toBe(200);
    expect(mockArchiveDraft).toHaveBeenCalledWith('draft-daniel', 'provider-daniel-hale-beta');

    const restoreResponse = await draftActionsRoute.PATCH(new Request('http://localhost/api/drafts/draft-daniel', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore', providerId: 'provider-stacey-creel-beta' }),
    }), { params: Promise.resolve({ draftId: 'draft-daniel' }) });
    expect(restoreResponse.status).toBe(200);
    expect(mockRestoreDraft).toHaveBeenCalledWith('draft-daniel', 'provider-daniel-hale-beta');

    const markOpenedResponse = await draftActionsRoute.PATCH(new Request('http://localhost/api/drafts/draft-daniel', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'mark-opened',
        providerId: 'provider-stacey-creel-beta',
        recoveryState: { workflowStage: 'review', composeLane: 'finish', recommendedStage: 'review', updatedAt: '2026-04-21T00:00:00.000Z' },
      }),
    }), { params: Promise.resolve({ draftId: 'draft-daniel' }) });
    expect(markOpenedResponse.status).toBe(200);
    expect(mockMarkDraftOpened).toHaveBeenCalledWith('draft-daniel', 'provider-daniel-hale-beta', expect.objectContaining({
      workflowStage: 'review',
    }));

    const deleteResponse = await draftActionsRoute.DELETE(
      new Request('http://localhost/api/drafts/draft-daniel?providerId=provider-stacey-creel-beta', { method: 'DELETE' }),
      { params: Promise.resolve({ draftId: 'draft-daniel' }) },
    );
    expect(deleteResponse.status).toBe(200);
    expect(mockDeleteDraft).toHaveBeenCalledWith('draft-daniel', 'provider-daniel-hale-beta');
  });
});
