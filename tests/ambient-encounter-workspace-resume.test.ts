// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AmbientEncounterWorkspace,
  type AmbientSessionPersistenceSnapshot,
} from '@/components/note/ambient/ambient-encounter-workspace';
import {
  getAmbientMockConsentDrafts,
  getAmbientMockParticipants,
  getAmbientMockSections,
  getAmbientMockSetupDraft,
  getAmbientMockTurns,
  type AmbientDraftSectionViewModel,
  type AmbientSessionSetupDraft,
  type AmbientTranscriptTurnViewModel,
} from '@/lib/ambient-listening/mock-data';
import type {
  AmbientParticipant,
  AmbientReviewFlag,
  AmbientSessionState,
  AmbientTranscriptDeliveryTransport,
  AmbientTranscriptSourceKind,
  AmbientTranscriptTransportPhase,
} from '@/types/ambient-listening';

type AmbientSessionPayload = {
  sessionId: string;
  encounterId: string;
  providerIdentityId: string;
  state: AmbientSessionState;
  setupDraft: AmbientSessionSetupDraft;
  participants: AmbientParticipant[];
  consentDrafts: ReturnType<typeof getAmbientMockConsentDrafts>;
  turns: AmbientTranscriptTurnViewModel[];
  sections: AmbientDraftSectionViewModel[];
  reviewFlags: AmbientReviewFlag[];
  queuedTranscriptEventCount?: number;
  transcriptAdapterId: string;
  transcriptAdapterLabel: string;
  transcriptSourceKind: AmbientTranscriptSourceKind;
  transcriptTransportPhase: AmbientTranscriptTransportPhase;
  transcriptDeliveryTransport: AmbientTranscriptDeliveryTransport;
  transcriptEventCount: number;
};

function buildSessionPayload(overrides: Partial<AmbientSessionPayload> = {}): AmbientSessionPayload {
  return {
    sessionId: overrides.sessionId || 'ambient-session-1',
    encounterId: overrides.encounterId || 'encounter-1',
    providerIdentityId: overrides.providerIdentityId || 'provider-daniel-hale-beta',
    state: overrides.state || 'consent_pending',
    setupDraft: overrides.setupDraft || {
      ...getAmbientMockSetupDraft(),
      transcriptSimulator: 'live_stream_adapter',
    },
    participants: overrides.participants || getAmbientMockParticipants(),
    consentDrafts: overrides.consentDrafts || getAmbientMockConsentDrafts(),
    turns: overrides.turns || [],
    sections: overrides.sections || getAmbientMockSections(),
    reviewFlags: overrides.reviewFlags || [],
    queuedTranscriptEventCount: overrides.queuedTranscriptEventCount || 0,
    transcriptAdapterId: overrides.transcriptAdapterId || 'ambient-openai-realtime-stub',
    transcriptAdapterLabel: overrides.transcriptAdapterLabel || 'OpenAI Realtime ambient adapter (stub)',
    transcriptSourceKind: overrides.transcriptSourceKind || 'none',
    transcriptTransportPhase: overrides.transcriptTransportPhase || 'idle',
    transcriptDeliveryTransport: overrides.transcriptDeliveryTransport || 'none',
    transcriptEventCount: overrides.transcriptEventCount || 0,
  };
}

class MockEventSource {
  url: string;
  onerror: ((this: EventSource, ev: Event) => any) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener() {}

  removeEventListener() {}

  close() {}
}

describe('ambient encounter workspace resume', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: ReturnType<typeof vi.fn>;
  let persistenceSnapshots: AmbientSessionPersistenceSnapshot[];

  beforeEach(() => {
    // Let React know this jsdom test intentionally wraps updates in act().
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    persistenceSnapshots = [];
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    container?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('persists consent-pending creation state and restores a ready-to-record session on remount', async () => {
    const createdSession = buildSessionPayload({ state: 'consent_pending' });
    const restoredSession = buildSessionPayload({
      state: 'ready_to_record',
      transcriptSourceKind: 'live_stream_adapter',
      transcriptTransportPhase: 'idle',
      transcriptDeliveryTransport: 'none',
      participants: getAmbientMockParticipants(),
      turns: getAmbientMockTurns().slice(0, 1),
      transcriptEventCount: 1,
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === '/api/ambient/sessions' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ session: createdSession }),
        } as Response;
      }

      if (url.includes('/api/ambient/sessions/ambient-session-1') && !init?.method) {
        return {
          ok: true,
          json: async () => ({ session: restoredSession }),
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url} ${init?.method || 'GET'}`);
    });

    await act(async () => {
      root.render(
        createElement(AmbientEncounterWorkspace, {
          providerIdentityId: 'provider-daniel-hale-beta',
          encounterId: 'encounter-1',
          transcriptModeActive: true,
          defaultCareSetting: 'inpatient',
          defaultMode: 'ambient_in_room',
          onCommitTranscriptToSource: () => {},
          onOpenTranscriptMode: () => {},
          onOpenDraftControls: () => {},
          onSessionPersistenceChange: (snapshot) => {
            persistenceSnapshots.push(snapshot);
          },
        }),
      );
    });

    const startButton = [...container.querySelectorAll('button')]
      .find((node) => node.textContent?.includes('Start ambient session'));
    expect(startButton).toBeTruthy();

    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/ambient/sessions', expect.objectContaining({
      method: 'POST',
    }));
    expect(persistenceSnapshots.some((snapshot) => (
      snapshot.sessionId === 'ambient-session-1' && snapshot.sessionState === 'consent_pending'
    ))).toBe(true);
    expect(container.textContent).toContain('Session: consent pending');

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(AmbientEncounterWorkspace, {
          providerIdentityId: 'provider-daniel-hale-beta',
          encounterId: 'encounter-1',
          transcriptModeActive: true,
          defaultCareSetting: 'inpatient',
          defaultMode: 'ambient_in_room',
          initialSessionId: 'ambient-session-1',
          onCommitTranscriptToSource: () => {},
          onOpenTranscriptMode: () => {},
          onOpenDraftControls: () => {},
          onSessionPersistenceChange: (snapshot) => {
            persistenceSnapshots.push(snapshot);
          },
        }),
      );
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/ambient/sessions/ambient-session-1?providerId=provider-daniel-hale-beta',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(persistenceSnapshots.some((snapshot) => (
      snapshot.sessionId === 'ambient-session-1' && snapshot.sessionState === 'ready_to_record'
    ))).toBe(true);
    expect(container.textContent).toContain('Session: ready to record');
    expect(container.textContent).toContain('1 transcript events');
  });
});
