import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthorizedProviderContext: vi.fn(),
  getAuthorizedDesktopBridgeContext: vi.fn(),
  prototypeSwitchingAllowed: vi.fn(),
  requireAuth: vi.fn(),
  listDrafts: vi.fn(),
  saveDraft: vi.fn(),
  getLatestDraft: vi.fn(),
  getDraftById: vi.fn(),
  archiveDraft: vi.fn(),
  restoreDraft: vi.fn(),
  markDraftOpened: vi.fn(),
  deleteDraft: vi.fn(),
  listNotePresets: vi.fn(),
  saveNotePresets: vi.fn(),
  getProviderSettings: vi.fn(),
  saveProviderSettings: vi.fn(),
  getAssistantLearning: vi.fn(),
  getVeraMemoryLedger: vi.fn(),
  saveAssistantLearning: vi.fn(),
  listDictationAuditEvents: vi.fn(),
  saveDictationAuditEvent: vi.fn(),
  listPatientContinuityRecords: vi.fn(),
  savePatientContinuityRecord: vi.fn(),
  markPatientContinuityUsed: vi.fn(),
  archivePatientContinuityRecord: vi.fn(),
  getCurrentProviderAccountId: vi.fn(),
  saveCurrentProviderAccountId: vi.fn(),
  getCurrentProviderIdentityId: vi.fn(),
  saveCurrentProviderIdentityId: vi.fn(),
  createServerDictationSession: vi.fn(),
  getServerDictationSession: vi.fn(),
  stopServerDictationSession: vi.fn(),
  appendServerDictationAudioChunk: vi.fn(),
  drainServerDictationTranscriptEvents: vi.fn(),
  submitServerDictationMockUtterance: vi.fn(),
  subscribeToServerDictationSession: vi.fn(),
  getRecentServerDictationAuditEvents: vi.fn(),
}));

vi.mock('@/lib/veranote/provider-session', () => ({
  getAuthorizedProviderContext: mocks.getAuthorizedProviderContext,
  resolveScopedProviderIdentityId: vi.fn((requestedProviderId: string | undefined, authorizedProviderId: string) => (
    requestedProviderId || authorizedProviderId
  )),
  prototypeSwitchingAllowed: mocks.prototypeSwitchingAllowed,
}));

vi.mock('@/lib/veranote/desktop-bridge-auth', () => ({
  getAuthorizedDesktopBridgeContext: mocks.getAuthorizedDesktopBridgeContext,
}));

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock('@/lib/db/client', () => ({
  listDrafts: mocks.listDrafts,
  saveDraft: mocks.saveDraft,
  getLatestDraft: mocks.getLatestDraft,
  getDraftById: mocks.getDraftById,
  archiveDraft: mocks.archiveDraft,
  restoreDraft: mocks.restoreDraft,
  markDraftOpened: mocks.markDraftOpened,
  deleteDraft: mocks.deleteDraft,
  listNotePresets: mocks.listNotePresets,
  saveNotePresets: mocks.saveNotePresets,
  getProviderSettings: mocks.getProviderSettings,
  saveProviderSettings: mocks.saveProviderSettings,
  getAssistantLearning: mocks.getAssistantLearning,
  getVeraMemoryLedger: mocks.getVeraMemoryLedger,
  saveAssistantLearning: mocks.saveAssistantLearning,
  listDictationAuditEvents: mocks.listDictationAuditEvents,
  saveDictationAuditEvent: mocks.saveDictationAuditEvent,
  listPatientContinuityRecords: mocks.listPatientContinuityRecords,
  savePatientContinuityRecord: mocks.savePatientContinuityRecord,
  markPatientContinuityUsed: mocks.markPatientContinuityUsed,
  archivePatientContinuityRecord: mocks.archivePatientContinuityRecord,
  getCurrentProviderAccountId: mocks.getCurrentProviderAccountId,
  saveCurrentProviderAccountId: mocks.saveCurrentProviderAccountId,
  getCurrentProviderIdentityId: mocks.getCurrentProviderIdentityId,
  saveCurrentProviderIdentityId: mocks.saveCurrentProviderIdentityId,
}));

vi.mock('@/lib/dictation/server-session-store', () => ({
  createServerDictationSession: mocks.createServerDictationSession,
  getServerDictationSession: mocks.getServerDictationSession,
  stopServerDictationSession: mocks.stopServerDictationSession,
  appendServerDictationAudioChunk: mocks.appendServerDictationAudioChunk,
  drainServerDictationTranscriptEvents: mocks.drainServerDictationTranscriptEvents,
  submitServerDictationMockUtterance: mocks.submitServerDictationMockUtterance,
  subscribeToServerDictationSession: mocks.subscribeToServerDictationSession,
  getRecentServerDictationAuditEvents: mocks.getRecentServerDictationAuditEvents,
}));

vi.mock('@/lib/dictation/server-stt-adapters', () => ({
  getServerSTTProviderStatuses: () => [{ providerId: 'mock-stt', available: true }],
  resolveServerSTTProviderSelection: () => ({
    activeProvider: 'mock-stt',
    activeProviderLabel: 'Mock STT',
    adapterId: 'mock-stt',
    engineLabel: 'mock',
    fallbackApplied: false,
  }),
}));

vi.mock('@/lib/dictation/overlay-draft-router', () => ({
  appendOverlaySegmentToDraft: vi.fn(),
}));

vi.mock('@/lib/veranote/memory/memory-store', () => ({
  addMemory: vi.fn(),
  getMemory: vi.fn(),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
}));

vi.mock('@/lib/security/safe-logger', () => ({
  logEvent: vi.fn(),
}));

vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: vi.fn(),
}));

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('provider data route security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthorizedProviderContext.mockResolvedValue(null);
    mocks.getAuthorizedDesktopBridgeContext.mockResolvedValue(null);
    mocks.prototypeSwitchingAllowed.mockReturnValue(true);
    mocks.requireAuth.mockRejectedValue(new Error('Unauthorized'));
  });

  it('blocks unauthenticated provider data reads before storage access', async () => {
    const draftsRoute = await import('@/app/api/drafts/route');
    const latestDraftRoute = await import('@/app/api/drafts/latest/route');
    const draftByIdRoute = await import('@/app/api/drafts/[draftId]/route');
    const presetsRoute = await import('@/app/api/presets/route');
    const settingsRoute = await import('@/app/api/settings/provider/route');
    const memoryRoute = await import('@/app/api/assistant/memory/route');
    const auditRoute = await import('@/app/api/dictation/audit/route');
    const continuityRoute = await import('@/app/api/patient-continuity/route');
    const accountsRoute = await import('@/app/api/provider-accounts/route');
    const identitiesRoute = await import('@/app/api/provider-identities/route');

    const responses = await Promise.all([
      draftsRoute.GET(new Request('http://localhost/api/drafts')),
      latestDraftRoute.GET(new Request('http://localhost/api/drafts/latest')),
      draftByIdRoute.GET(new Request('http://localhost/api/drafts/draft-1'), {
        params: Promise.resolve({ draftId: 'draft-1' }),
      }),
      presetsRoute.GET(new Request('http://localhost/api/presets')),
      settingsRoute.GET(new Request('http://localhost/api/settings/provider')),
      memoryRoute.GET(new Request('http://localhost/api/assistant/memory')),
      auditRoute.GET(new Request('http://localhost/api/dictation/audit')),
      continuityRoute.GET(new Request('http://localhost/api/patient-continuity')),
      accountsRoute.GET(),
      identitiesRoute.GET(),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401, 401, 401, 401, 401, 401,
    ]);
    expect(mocks.listDrafts).not.toHaveBeenCalled();
    expect(mocks.getLatestDraft).not.toHaveBeenCalled();
    expect(mocks.getDraftById).not.toHaveBeenCalled();
    expect(mocks.listNotePresets).not.toHaveBeenCalled();
    expect(mocks.getProviderSettings).not.toHaveBeenCalled();
    expect(mocks.getAssistantLearning).not.toHaveBeenCalled();
    expect(mocks.listDictationAuditEvents).not.toHaveBeenCalled();
    expect(mocks.listPatientContinuityRecords).not.toHaveBeenCalled();
    expect(mocks.getCurrentProviderAccountId).not.toHaveBeenCalled();
    expect(mocks.getCurrentProviderIdentityId).not.toHaveBeenCalled();
  });

  it('blocks unauthenticated provider data writes before mutation side effects', async () => {
    const draftsRoute = await import('@/app/api/drafts/route');
    const draftByIdRoute = await import('@/app/api/drafts/[draftId]/route');
    const presetsRoute = await import('@/app/api/presets/route');
    const settingsRoute = await import('@/app/api/settings/provider/route');
    const memoryRoute = await import('@/app/api/assistant/memory/route');
    const memoryByIdRoute = await import('@/app/api/assistant/memory/[id]/route');
    const dictationSessionsRoute = await import('@/app/api/dictation/sessions/route');
    const dictationSessionRoute = await import('@/app/api/dictation/sessions/[sessionId]/route');
    const auditRoute = await import('@/app/api/dictation/audit/route');
    const continuityRoute = await import('@/app/api/patient-continuity/route');
    const accountsRoute = await import('@/app/api/provider-accounts/route');
    const identitiesRoute = await import('@/app/api/provider-identities/route');

    const responses = await Promise.all([
      draftsRoute.POST(jsonRequest('http://localhost/api/drafts', { sourceInput: 'source', note: 'note' })),
      draftByIdRoute.PATCH(jsonRequest('http://localhost/api/drafts/draft-1', { action: 'archive' }, 'PATCH'), {
        params: Promise.resolve({ draftId: 'draft-1' }),
      }),
      draftByIdRoute.DELETE(new Request('http://localhost/api/drafts/draft-1', { method: 'DELETE' }), {
        params: Promise.resolve({ draftId: 'draft-1' }),
      }),
      presetsRoute.POST(jsonRequest('http://localhost/api/presets', { presets: [] })),
      settingsRoute.POST(jsonRequest('http://localhost/api/settings/provider', {})),
      memoryRoute.POST(jsonRequest('http://localhost/api/assistant/memory', { learningStore: {} })),
      memoryByIdRoute.DELETE(new Request('http://localhost/api/assistant/memory/memory-1', { method: 'DELETE' }), {
        params: Promise.resolve({ id: 'memory-1' }),
      }),
      dictationSessionsRoute.POST(jsonRequest('http://localhost/api/dictation/sessions', { encounterId: 'encounter-1' })),
      dictationSessionRoute.POST(jsonRequest('http://localhost/api/dictation/sessions/session-1', { action: 'stop' }), {
        params: Promise.resolve({ sessionId: 'session-1' }),
      }),
      auditRoute.POST(jsonRequest('http://localhost/api/dictation/audit', {})),
      continuityRoute.POST(jsonRequest('http://localhost/api/patient-continuity', {})),
      accountsRoute.POST(jsonRequest('http://localhost/api/provider-accounts', { providerAccountId: 'account-stacey-creel-beta' })),
      identitiesRoute.POST(jsonRequest('http://localhost/api/provider-identities', { providerId: 'provider-stacey-creel-beta' })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401, 401,
    ]);
    expect(mocks.saveDraft).not.toHaveBeenCalled();
    expect(mocks.archiveDraft).not.toHaveBeenCalled();
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.saveNotePresets).not.toHaveBeenCalled();
    expect(mocks.saveProviderSettings).not.toHaveBeenCalled();
    expect(mocks.saveAssistantLearning).not.toHaveBeenCalled();
    expect(mocks.createServerDictationSession).not.toHaveBeenCalled();
    expect(mocks.stopServerDictationSession).not.toHaveBeenCalled();
    expect(mocks.saveDictationAuditEvent).not.toHaveBeenCalled();
    expect(mocks.savePatientContinuityRecord).not.toHaveBeenCalled();
    expect(mocks.saveCurrentProviderAccountId).not.toHaveBeenCalled();
    expect(mocks.saveCurrentProviderIdentityId).not.toHaveBeenCalled();
  });
});
