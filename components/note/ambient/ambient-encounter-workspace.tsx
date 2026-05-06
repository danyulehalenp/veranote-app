'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AmbientConsentGateSheet } from '@/components/note/ambient/ambient-consent-gate-sheet';
import { AmbientControlBar } from '@/components/note/ambient/ambient-control-bar';
import { AmbientDraftReviewPanel } from '@/components/note/ambient/ambient-draft-review-panel';
import { AmbientSpeakerCorrectionDrawer } from '@/components/note/ambient/ambient-speaker-correction-drawer';
import { AmbientTranscriptWorkspace } from '@/components/note/ambient/ambient-transcript-workspace';
import {
  getAmbientMockConsentDrafts,
  getAmbientMockSetupDraft,
  type AmbientConsentEventDraft,
  type AmbientDraftSectionViewModel,
  type AmbientSessionSetupDraft,
  type AmbientTranscriptTurnViewModel,
} from '@/lib/ambient-listening/mock-data';
import type {
  AmbientCareSetting,
  AmbientListeningMode,
  AmbientParticipant,
  AmbientParticipantRole,
  AmbientReviewFlag,
  AmbientSessionState,
  AmbientTranscriptDeliveryTransport,
  AmbientTranscriptSourceKind,
  AmbientTranscriptTransportPhase,
} from '@/types/ambient-listening';
import { getAmbientWorkspaceChromeStorageKey } from '@/lib/veranote/provider-identity';
import {
  browserDictationSupported,
  requestBrowserDictationStream,
  setBrowserDictationStreamPaused,
  stopBrowserDictationStream,
} from '@/lib/dictation/browser-mic';
import {
  browserRecorderSupported,
  buildCumulativeDictationAudioBlob,
  encodeBlobToBase64,
  getPreferredRecorderMimeType,
} from '@/lib/dictation/browser-recorder';
import { AMBIENT_SOURCE_HANDOFF_CONTRACT } from '@/lib/note/source-lane-contract';

type AmbientSessionPayload = {
  sessionId: string;
  encounterId: string;
  providerIdentityId: string;
  state: AmbientSessionState;
  setupDraft: AmbientSessionSetupDraft;
  participants: AmbientParticipant[];
  consentDrafts: AmbientConsentEventDraft[];
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

type AmbientStreamStatus = 'idle' | 'connecting' | 'connected' | 'degraded';

type AmbientTranscriptEventPayload = {
  id: string;
  eventType: 'interim_turn' | 'final_turn';
  occurredAt: string;
};

type AmbientWorkspaceChromePreference = {
  minimized: boolean;
  floating: boolean;
  x: number | null;
  y: number | null;
};

type AmbientDragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

const DEFAULT_AMBIENT_CHROME_PREFERENCE: AmbientWorkspaceChromePreference = {
  minimized: false,
  floating: false,
  x: null,
  y: null,
};

function clampAmbientFloatingPosition(x: number, y: number) {
  if (typeof window === 'undefined') {
    return { x, y };
  }

  const padding = 16;
  const width = Math.min(420, Math.max(320, window.innerWidth - (padding * 2)));
  const maxX = Math.max(padding, window.innerWidth - width - padding);
  const maxY = Math.max(padding, window.innerHeight - 92);

  return {
    x: Math.min(Math.max(x, padding), maxX),
    y: Math.min(Math.max(y, 72), maxY),
  };
}

function getDefaultAmbientFloatingPosition() {
  if (typeof window === 'undefined') {
    return { x: 24, y: 96 };
  }

  const width = Math.min(420, Math.max(320, window.innerWidth - 32));
  return clampAmbientFloatingPosition(window.innerWidth - width - 24, 96);
}

export type AmbientSessionPersistenceSnapshot = {
  sessionId: string | null;
  encounterId: string;
  sessionState: AmbientSessionState;
  transcriptEventCount: number;
  unresolvedSpeakerTurnCount: number;
  reviewFlagCount: number;
  transcriptReadyForSource: boolean;
  updatedAt: string;
};

function formatAmbientSpeaker(turn: AmbientTranscriptTurnViewModel) {
  if (turn.speakerRole === 'provider') {
    return 'Provider';
  }
  if (turn.speakerRole === 'patient') {
    return 'Patient';
  }
  return turn.speakerLabel || turn.speakerRole.replace(/_/g, ' ');
}

function buildAmbientTranscriptSource(turns: AmbientTranscriptTurnViewModel[]) {
  return turns
    .filter((turn) => turn.isFinal && !turn.excludedFromDraft)
    .map((turn) => `${formatAmbientSpeaker(turn)}: ${turn.text.trim()}`)
    .join('\n');
}

function summarizeAmbientSessionForPersistence(session: AmbientSessionPayload): AmbientSessionPersistenceSnapshot {
  const unresolvedSpeakerTurnCount = session.turns.filter(
    (turn) => !turn.excludedFromDraft && turn.attributionNeedsReview && !turn.providerConfirmed,
  ).length;
  const transcriptSourceText = buildAmbientTranscriptSource(session.turns);

  return {
    sessionId: session.sessionId,
    encounterId: session.encounterId,
    sessionState: session.state,
    transcriptEventCount: session.transcriptEventCount,
    unresolvedSpeakerTurnCount,
    reviewFlagCount: session.reviewFlags.length,
    transcriptReadyForSource: Boolean(transcriptSourceText.trim()) && unresolvedSpeakerTurnCount === 0,
    updatedAt: new Date().toISOString(),
  };
}

export function AmbientEncounterWorkspace({
  providerIdentityId,
  encounterId,
  transcriptModeActive,
  defaultCareSetting,
  defaultMode,
  initialSessionId,
  onCommitTranscriptToSource,
  onOpenTranscriptMode,
  onOpenDraftControls,
  onSessionSummaryChange,
  onSessionPersistenceChange,
}: {
  providerIdentityId: string;
  encounterId: string;
  transcriptModeActive: boolean;
  defaultCareSetting: AmbientCareSetting;
  defaultMode: AmbientListeningMode;
  initialSessionId?: string | null;
  onCommitTranscriptToSource: (text: string, mode: 'replace' | 'append') => void;
  onOpenTranscriptMode: () => void;
  onOpenDraftControls: () => void;
  onSessionSummaryChange?: (summary: {
    sessionState: AmbientSessionState;
    transcriptEventCount: number;
    unresolvedSpeakerTurnCount: number;
    reviewFlagCount: number;
    transcriptReadyForSource: boolean;
  }) => void;
  onSessionPersistenceChange?: (snapshot: AmbientSessionPersistenceSnapshot) => void;
}) {
  const [setupDraft, setSetupDraft] = useState<AmbientSessionSetupDraft>(() => ({
    ...getAmbientMockSetupDraft(),
    careSetting: defaultCareSetting,
    mode: defaultMode,
    captureRuntime: 'real_microphone',
    transcriptSimulator: 'live_stream_adapter',
  }));
  const [sessionState, setSessionState] = useState<AmbientSessionState>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<AmbientParticipant[]>([]);
  const [consentDrafts, setConsentDrafts] = useState<AmbientConsentEventDraft[]>(getAmbientMockConsentDrafts);
  const [turns, setTurns] = useState<AmbientTranscriptTurnViewModel[]>([]);
  const [sections, setSections] = useState<AmbientDraftSectionViewModel[]>([]);
  const [reviewFlags, setReviewFlags] = useState<AmbientReviewFlag[]>([]);
  const [selectedTurnId, setSelectedTurnId] = useState<string>('');
  const [speakerDrawerOpen, setSpeakerDrawerOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [streamStatus, setStreamStatus] = useState<AmbientStreamStatus>('idle');
  const [pollingActive, setPollingActive] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [transcriptEventCount, setTranscriptEventCount] = useState(0);
  const [queuedTranscriptEventCount, setQueuedTranscriptEventCount] = useState(0);
  const [transcriptAdapterLabel, setTranscriptAdapterLabel] = useState('Ambient transcript adapter');
  const [transcriptSourceKind, setTranscriptSourceKind] = useState<AmbientTranscriptSourceKind>('none');
  const [transcriptTransportPhase, setTranscriptTransportPhase] = useState<AmbientTranscriptTransportPhase>('idle');
  const [transcriptDeliveryTransport, setTranscriptDeliveryTransport] = useState<AmbientTranscriptDeliveryTransport>('none');
  const [chromePreference, setChromePreference] = useState<AmbientWorkspaceChromePreference>(DEFAULT_AMBIENT_CHROME_PREFERENCE);
  const [dragState, setDragState] = useState<AmbientDragState | null>(null);
  const lastTranscriptEventAtRef = useRef<string | null>(null);
  const ambientMediaStreamRef = useRef<MediaStream | null>(null);
  const ambientRecorderRef = useRef<MediaRecorder | null>(null);
  const ambientRecordedAudioChunksRef = useRef<Blob[]>([]);
  const restoreAttemptedSessionIdRef = useRef<string | null>(null);
  const restorePendingSessionIdRef = useRef<string | null>(null);
  const onSessionSummaryChangeRef = useRef(onSessionSummaryChange);
  const onSessionPersistenceChangeRef = useRef(onSessionPersistenceChange);
  const chromeStorageKey = useMemo(() => getAmbientWorkspaceChromeStorageKey(providerIdentityId), [providerIdentityId]);
  const ambientHandoffStepLabel = AMBIENT_SOURCE_HANDOFF_CONTRACT.orderedSteps.map((step) => step.label).join(' -> ');

  useEffect(() => {
    onSessionSummaryChangeRef.current = onSessionSummaryChange;
  }, [onSessionSummaryChange]);

  useEffect(() => {
    onSessionPersistenceChangeRef.current = onSessionPersistenceChange;
  }, [onSessionPersistenceChange]);

  useEffect(() => (
    () => {
      try {
        ambientRecorderRef.current?.stop();
      } catch {
        // Ignore cleanup from already-stopped recorders.
      }
      ambientRecorderRef.current = null;
      ambientRecordedAudioChunksRef.current = [];
      stopBrowserDictationStream(ambientMediaStreamRef.current);
      ambientMediaStreamRef.current = null;
    }
  ), []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(chromeStorageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<AmbientWorkspaceChromePreference>;
      setChromePreference((current) => ({
        minimized: typeof parsed.minimized === 'boolean' ? parsed.minimized : current.minimized,
        floating: typeof parsed.floating === 'boolean' ? parsed.floating : current.floating,
        x: typeof parsed.x === 'number' ? parsed.x : current.x,
        y: typeof parsed.y === 'number' ? parsed.y : current.y,
      }));
    } catch {
      window.localStorage.removeItem(chromeStorageKey);
    }
  }, [chromeStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(chromeStorageKey, JSON.stringify(chromePreference));
  }, [chromePreference, chromeStorageKey]);

  useEffect(() => {
    if (!chromePreference.floating) {
      return;
    }

    const handleResize = () => {
      setChromePreference((current) => {
        if (!current.floating) {
          return current;
        }

        const nextPosition = current.x === null || current.y === null
          ? getDefaultAmbientFloatingPosition()
          : clampAmbientFloatingPosition(current.x, current.y);

        if (nextPosition.x === current.x && nextPosition.y === current.y) {
          return current;
        }

        return {
          ...current,
          x: nextPosition.x,
          y: nextPosition.y,
        };
      });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [chromePreference.floating]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const nextPosition = clampAmbientFloatingPosition(
        event.clientX - dragState.offsetX,
        event.clientY - dragState.offsetY,
      );
      setChromePreference((current) => ({
        ...current,
        floating: true,
        x: nextPosition.x,
        y: nextPosition.y,
      }));
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId === dragState.pointerId) {
        setDragState(null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [dragState]);

  useEffect(() => {
    if (sessionId) {
      return;
    }

    setSetupDraft((current) => ({
      ...current,
      careSetting: defaultCareSetting,
      mode: defaultMode,
    }));
  }, [defaultCareSetting, defaultMode, sessionId]);

  useEffect(() => {
    if (!initialSessionId || sessionId || restoreAttemptedSessionIdRef.current === initialSessionId) {
      return;
    }

    restoreAttemptedSessionIdRef.current = initialSessionId;
    restorePendingSessionIdRef.current = initialSessionId;
    let cancelled = false;

    void (async () => {
      setRequestError(null);
      try {
        const response = await fetch(`/api/ambient/sessions/${encodeURIComponent(initialSessionId)}?providerId=${encodeURIComponent(providerIdentityId)}`, {
          cache: 'no-store',
        });
        const payload = await response.json() as { session?: AmbientSessionPayload; error?: string };
        if (!response.ok || !payload.session) {
          throw new Error(payload.error || 'Unable to reopen ambient session.');
        }

        if (!cancelled) {
          restorePendingSessionIdRef.current = null;
          applySession(payload.session);
        }
      } catch (error) {
        if (!cancelled) {
          restorePendingSessionIdRef.current = null;
          setRequestError(error instanceof Error ? error.message : 'Unable to reopen ambient session.');
          onSessionPersistenceChangeRef.current?.({
            sessionId: null,
            encounterId,
            sessionState: 'idle',
            transcriptEventCount: 0,
            unresolvedSpeakerTurnCount: 0,
            reviewFlagCount: 0,
            transcriptReadyForSource: false,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [encounterId, initialSessionId, providerIdentityId, sessionId]);

  useEffect(() => {
    if (sessionState !== 'recording') {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [sessionState]);

  useEffect(() => {
    if (!sessionId) {
      setStreamStatus('idle');
      return undefined;
    }

    setStreamStatus('connecting');
    const stream = new EventSource(`/api/ambient/sessions/${sessionId}?providerId=${encodeURIComponent(providerIdentityId)}&stream=1`);

    const handleSessionState = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as AmbientSessionPayload;
        setStreamStatus('connected');
        applySession(payload);
      } catch {
        // Keep the workspace resilient if one stream event is malformed.
      }
    };

    const handleTranscriptEvent = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as AmbientTranscriptEventPayload;
        setStreamStatus('connected');
        lastTranscriptEventAtRef.current = payload.occurredAt;
      } catch {
        // Ignore malformed transcript events and keep the session alive.
      }
    };

    stream.addEventListener('session_state', handleSessionState as EventListener);
    stream.addEventListener('transcript_event', handleTranscriptEvent as EventListener);
    stream.onerror = () => setStreamStatus('degraded');

    return () => {
      stream.removeEventListener('session_state', handleSessionState as EventListener);
      stream.removeEventListener('transcript_event', handleTranscriptEvent as EventListener);
      stream.close();
    };
  }, [providerIdentityId, sessionId]);

  useEffect(() => {
    if (!sessionId || sessionState !== 'recording' || transcriptSourceKind === 'live_stream_adapter') {
      setPollingActive(false);
      return undefined;
    }

    let cancelled = false;

    const poll = async () => {
      if (cancelled) {
        return;
      }

      setPollingActive(true);
      try {
        await pullTranscriptEvents();
      } catch (error) {
        if (!cancelled) {
          setRequestError(error instanceof Error ? error.message : 'Unable to poll ambient transcript events.');
        }
      } finally {
        if (!cancelled) {
          setPollingActive(false);
        }
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 1200);

    return () => {
      cancelled = true;
      setPollingActive(false);
      window.clearInterval(interval);
    };
  }, [sessionId, sessionState, transcriptSourceKind]);

  const consentReady = consentDrafts.length > 0 && consentDrafts.every((draft) => draft.status === 'granted');
  const selectedTurn = turns.find((turn) => turn.id === selectedTurnId) || null;
  const unresolvedSpeakerTurns = turns.filter((turn) => !turn.excludedFromDraft && turn.attributionNeedsReview && !turn.providerConfirmed);
  const transcriptSourceText = useMemo(() => buildAmbientTranscriptSource(turns), [turns]);
  const acceptedSentenceCount = useMemo(
    () => sections.reduce((total, section) => total + section.sentences.filter((sentence) => sentence.accepted).length, 0),
    [sections],
  );
  const blockedSentenceCount = useMemo(
    () => sections.reduce((total, section) => total + section.sentences.filter((sentence) => sentence.blockingFlagIds.length > 0).length, 0),
    [sections],
  );
  const transcriptReadyForSource = Boolean(transcriptSourceText.trim()) && unresolvedSpeakerTurns.length === 0;
  const transcriptDeliveryLabel = transcriptEventCount
    ? `${transcriptEventCount} event${transcriptEventCount === 1 ? '' : 's'} delivered`
    : 'Awaiting transcript events';
  const transportWarning = unresolvedSpeakerTurns.length
    ? 'Some transcript turns still need speaker review before this encounter should be treated as source-backed ambient material.'
    : streamStatus === 'degraded'
      ? 'Ambient session streaming degraded. Keep transcript review visible and verify event flow before trusting the handoff.'
      : null;
  useEffect(() => {
    if (!sessionId && initialSessionId) {
      return;
    }

    onSessionSummaryChangeRef.current?.({
      sessionState,
      transcriptEventCount,
      unresolvedSpeakerTurnCount: unresolvedSpeakerTurns.length,
      reviewFlagCount: reviewFlags.length,
      transcriptReadyForSource,
    });

    onSessionPersistenceChangeRef.current?.({
      sessionId,
      encounterId,
      sessionState,
      transcriptEventCount,
      unresolvedSpeakerTurnCount: unresolvedSpeakerTurns.length,
      reviewFlagCount: reviewFlags.length,
      transcriptReadyForSource,
      updatedAt: new Date().toISOString(),
    });
  }, [
    encounterId,
    reviewFlags.length,
    sessionId,
    sessionState,
    transcriptEventCount,
    transcriptReadyForSource,
    unresolvedSpeakerTurns.length,
    initialSessionId,
  ]);

  function applySession(session: AmbientSessionPayload) {
    setSessionId(session.sessionId);
    setSessionState(session.state);
    setSetupDraft(session.setupDraft);
    setParticipants(session.participants);
    setConsentDrafts(session.consentDrafts);
    setTurns(session.turns);
    setSections(session.sections);
    setReviewFlags(session.reviewFlags);
    setTranscriptEventCount(session.transcriptEventCount);
    setQueuedTranscriptEventCount(session.queuedTranscriptEventCount || 0);
    setTranscriptAdapterLabel(session.transcriptAdapterLabel);
    setTranscriptSourceKind(session.transcriptSourceKind);
    setTranscriptTransportPhase(session.transcriptTransportPhase);
    setTranscriptDeliveryTransport(session.transcriptDeliveryTransport);
    onSessionPersistenceChange?.(summarizeAmbientSessionForPersistence(session));

    if (session.turns.length && !session.turns.some((turn) => turn.id === selectedTurnId)) {
      setSelectedTurnId(session.turns[0].id);
    }
  }

  async function withRequest(action: () => Promise<void>) {
    setRequestError(null);
    try {
      await action();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Ambient request failed.');
    }
  }

  async function createSession() {
    const response = await fetch('/api/ambient/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: providerIdentityId,
        encounterId,
        setupDraft,
      }),
    });

    const payload = await response.json() as { session?: AmbientSessionPayload; error?: string };
    if (!response.ok || !payload.session) {
      throw new Error(payload.error || 'Unable to create ambient session.');
    }

    applySession(payload.session);
    return payload.session;
  }

  async function updateSession(action: Record<string, unknown>) {
    if (!sessionId) {
      throw new Error('Ambient session is not initialized.');
    }

    const response = await fetch(`/api/ambient/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: providerIdentityId,
        ...action,
      }),
    });

    const payload = await response.json() as { session?: AmbientSessionPayload; error?: string };
    if (!response.ok || !payload.session) {
      throw new Error(payload.error || 'Unable to update ambient session.');
    }

    applySession(payload.session);
    return payload.session;
  }

  async function pullTranscriptEvents() {
    if (!sessionId) {
      return;
    }

    const response = await fetch(`/api/ambient/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: providerIdentityId,
        action: 'pull_events',
      }),
    });

    const payload = await response.json() as {
      session?: AmbientSessionPayload;
      transcriptEvents?: AmbientTranscriptEventPayload[];
      error?: string;
    };
    if (!response.ok || !payload.session) {
      throw new Error(payload.error || 'Unable to load ambient transcript events.');
    }

    if (payload.transcriptEvents?.length) {
      lastTranscriptEventAtRef.current = payload.transcriptEvents[payload.transcriptEvents.length - 1]?.occurredAt || null;
    }

    applySession(payload.session);
  }

  async function beginAmbientCapture() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      throw new Error('Ambient microphone capture is only available in the browser.');
    }

    if (!browserDictationSupported(navigator.mediaDevices) || typeof MediaRecorder === 'undefined' || !browserRecorderSupported(MediaRecorder)) {
      throw new Error('Ambient microphone capture is not available in this browser.');
    }

    const stream = await requestBrowserDictationStream(navigator.mediaDevices, {
      secureContext: window.isSecureContext,
    });
    const mimeType = getPreferredRecorderMimeType(MediaRecorder);
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    ambientRecordedAudioChunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        ambientRecordedAudioChunksRef.current.push(event.data);
      }
    };

    ambientMediaStreamRef.current = stream;
    ambientRecorderRef.current = recorder;
    recorder.start();
  }

  async function finalizeAmbientCaptureBlob() {
    const recorder = ambientRecorderRef.current;
    if (!recorder) {
      throw new Error('Ambient microphone capture has not started.');
    }

    const finalBlob = await new Promise<Blob>((resolve, reject) => {
      const handleStop = () => {
        recorder.removeEventListener('stop', handleStop);
        recorder.removeEventListener('error', handleError);
        try {
          resolve(buildCumulativeDictationAudioBlob(
            ambientRecordedAudioChunksRef.current,
            recorder.mimeType || 'audio/webm',
          ));
        } catch (error) {
          reject(error);
        }
      };
      const handleError = () => {
        recorder.removeEventListener('stop', handleStop);
        recorder.removeEventListener('error', handleError);
        reject(new Error('Ambient recording failed before transcription.'));
      };

      recorder.addEventListener('stop', handleStop, { once: true });
      recorder.addEventListener('error', handleError, { once: true });

      try {
        recorder.stop();
      } catch (error) {
        recorder.removeEventListener('stop', handleStop);
        recorder.removeEventListener('error', handleError);
        reject(error);
      }
    });

    ambientRecorderRef.current = null;
    stopBrowserDictationStream(ambientMediaStreamRef.current);
    ambientMediaStreamRef.current = null;
    return finalBlob;
  }

  function handlePrepareSession() {
    void withRequest(async () => {
      if (!sessionId) {
        await createSession();
      }
      setConsentOpen(true);
    });
  }

  function updateConsentDraft(participantId: string, patch: Partial<AmbientConsentEventDraft>) {
    setConsentDrafts((current) => current.map((draft) => (
      draft.participantId === participantId
        ? { ...draft, ...patch }
        : draft
    )));
  }

  function confirmConsentReady() {
    void withRequest(async () => {
      await updateSession({
        action: 'save_consent',
        consentDrafts,
      });
      setConsentOpen(false);
    });
  }

  function relabelSpeaker(turnId: string, role: AmbientParticipantRole) {
    void withRequest(async () => {
      await updateSession({ action: 'relabel_turn', turnId, role });
    });
  }

  function setSpeakerLabel(turnId: string, speakerLabel: string | null) {
    void withRequest(async () => {
      await updateSession({ action: 'set_speaker_label', turnId, speakerLabel });
    });
  }

  function markProviderConfirmed(turnId: string) {
    void withRequest(async () => {
      await updateSession({ action: 'confirm_turn', turnId });
    });
  }

  function markUnresolved(turnId: string) {
    void withRequest(async () => {
      await updateSession({ action: 'mark_unresolved', turnId });
    });
  }

  function excludeTurn(turnId: string) {
    void withRequest(async () => {
      await updateSession({ action: 'exclude_turn', turnId });
    });
  }

  function restoreTurn(turnId: string) {
    void withRequest(async () => {
      await updateSession({ action: 'restore_turn', turnId });
    });
  }

  function acceptSentence(sentenceId: string) {
    void withRequest(async () => {
      await updateSession({ action: 'accept_sentence', sentenceId });
    });
  }

  function rejectSentence(sentenceId: string) {
    void withRequest(async () => {
      await updateSession({ action: 'reject_sentence', sentenceId });
    });
  }

  function editSentence(sentenceId: string, text: string) {
    void withRequest(async () => {
      await updateSession({ action: 'edit_sentence', sentenceId, text });
    });
  }

  function acceptSection(sectionId: string) {
    void withRequest(async () => {
      await updateSession({ action: 'accept_section', sectionId });
    });
  }

  function stopRecording() {
    void withRequest(async () => {
      const audioBlob = await finalizeAmbientCaptureBlob();
      await updateSession({ action: 'set_state', state: 'processing_transcript' });
      await updateSession({
        action: 'transcribe_audio',
        audio: {
          base64Audio: await encodeBlobToBase64(audioBlob),
          mimeType: audioBlob.type || 'audio/webm',
          sizeBytes: audioBlob.size,
          capturedAt: new Date().toISOString(),
        },
      });
      onOpenTranscriptMode();
    });
  }

  function toggleFloating() {
    setChromePreference((current) => {
      if (current.floating) {
        return {
          ...current,
          floating: false,
        };
      }

      const nextPosition = current.x === null || current.y === null
        ? getDefaultAmbientFloatingPosition()
        : clampAmbientFloatingPosition(current.x, current.y);

      return {
        ...current,
        floating: true,
        x: nextPosition.x,
        y: nextPosition.y,
      };
    });
  }

  function toggleMinimized() {
    setChromePreference((current) => ({
      ...current,
      minimized: !current.minimized,
    }));
  }

  function resetFloatingPosition() {
    const nextPosition = getDefaultAmbientFloatingPosition();
    setChromePreference((current) => ({
      ...current,
      x: nextPosition.x,
      y: nextPosition.y,
    }));
  }

  function startDragging(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!chromePreference.floating) {
      return;
    }

    const wrapperRect = event.currentTarget.closest('[data-ambient-floating-shell="true"]')?.getBoundingClientRect();
    const currentPosition = wrapperRect
      ? { x: wrapperRect.left, y: wrapperRect.top }
      : chromePreference.x === null || chromePreference.y === null
        ? getDefaultAmbientFloatingPosition()
        : clampAmbientFloatingPosition(chromePreference.x, chromePreference.y);

    setDragState({
      pointerId: event.pointerId,
      offsetX: event.clientX - currentPosition.x,
      offsetY: event.clientY - currentPosition.y,
    });
  }

  const controlShellStyle = useMemo(() => {
    if (!chromePreference.floating) {
      return undefined;
    }

    const position = chromePreference.x === null || chromePreference.y === null
      ? getDefaultAmbientFloatingPosition()
      : clampAmbientFloatingPosition(chromePreference.x, chromePreference.y);

    return {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: 'min(420px, calc(100vw - 2rem))',
    };
  }, [chromePreference.floating, chromePreference.x, chromePreference.y]);

  return (
    <div className="grid gap-4">
      <div
        data-ambient-floating-shell={chromePreference.floating ? 'true' : 'false'}
        className={chromePreference.floating ? 'fixed z-30' : undefined}
        style={controlShellStyle}
      >
        <AmbientControlBar
          enabled
          sessionState={sessionState}
          mode={setupDraft.mode}
          careSetting={setupDraft.careSetting}
          isFloating={chromePreference.floating}
          isMinimized={chromePreference.minimized}
          eyebrowLabel="Encounter control"
          titleLabel="Ambient session controls stay above source entry"
          consentSummaryLabel={consentReady ? 'Consent ready' : 'Consent required'}
          participantSummaryLabel={participants.length ? `${participants.length} participants` : 'Participants pending'}
          providerLabel="Current visit"
          elapsedSeconds={elapsedSeconds}
          helperText={requestError || 'Ambient listening belongs to the encounter, not to one source card. Record here, review in Transcript mode, and move only reviewed material into the note source.'}
          streamStatus={streamStatus}
          pollingActive={pollingActive}
          transcriptAdapterLabel={transcriptAdapterLabel}
          transcriptSourceKind={transcriptSourceKind}
          transcriptTransportPhase={transcriptTransportPhase}
          transcriptDeliveryTransport={transcriptDeliveryTransport}
          transcriptDeliveryLabel={transcriptDeliveryLabel}
          transportWarning={transportWarning}
          onToggleMinimized={toggleMinimized}
          onToggleFloating={toggleFloating}
          onResetFloatingPosition={resetFloatingPosition}
          onDragHandlePointerDown={startDragging}
          startLabel={sessionState === 'ready_to_record' ? 'Start ambient session' : undefined}
          stopLabel="Stop + generate"
          onPrepareSession={handlePrepareSession}
          onStartRecording={() => {
            void withRequest(async () => {
              setElapsedSeconds(0);
              await beginAmbientCapture();
              try {
                await updateSession({ action: 'set_state', state: 'recording' });
              } catch (error) {
                try {
                  ambientRecorderRef.current?.stop();
                } catch {
                  // Ignore cleanup failures.
                }
                ambientRecorderRef.current = null;
                ambientRecordedAudioChunksRef.current = [];
                stopBrowserDictationStream(ambientMediaStreamRef.current);
                ambientMediaStreamRef.current = null;
                throw error;
              }
            });
          }}
          onPauseRecording={() => {
            void withRequest(async () => {
              setBrowserDictationStreamPaused(ambientMediaStreamRef.current, true);
              if (ambientRecorderRef.current?.state === 'recording') {
                ambientRecorderRef.current.pause();
              }
              await updateSession({ action: 'set_state', state: 'paused' });
            });
          }}
          onResumeRecording={() => {
            void withRequest(async () => {
              setBrowserDictationStreamPaused(ambientMediaStreamRef.current, false);
              if (ambientRecorderRef.current?.state === 'paused') {
                ambientRecorderRef.current.resume();
              }
              await updateSession({ action: 'set_state', state: 'recording' });
            });
          }}
          onOffRecordStart={() => {
            void withRequest(async () => {
              setBrowserDictationStreamPaused(ambientMediaStreamRef.current, true);
              if (ambientRecorderRef.current?.state === 'recording') {
                ambientRecorderRef.current.pause();
              }
              await updateSession({ action: 'set_state', state: 'off_record' });
            });
          }}
          onOffRecordEnd={() => {
            void withRequest(async () => {
              setBrowserDictationStreamPaused(ambientMediaStreamRef.current, false);
              if (ambientRecorderRef.current?.state === 'paused') {
                ambientRecorderRef.current.resume();
              }
              await updateSession({ action: 'set_state', state: 'recording' });
            });
          }}
          onStopRecording={stopRecording}
        />
      </div>

      {transcriptModeActive ? (
        <div className="grid gap-4">
          <div className="rounded-[24px] border border-cyan-200/12 bg-[rgba(255,255,255,0.04)] p-4 text-cyan-50">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Transcript mode</div>
                <div className="mt-1 text-base font-semibold text-white">Review ambient transcript before it becomes note source</div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-cyan-50/74">
                  This lane is for speaker review, exclusions, and evidence-linked acceptance. Ambient text should move into the note only after the encounter transcript is resolved enough to trust.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-cyan-200/14 bg-[rgba(255,255,255,0.05)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                  {transcriptEventCount} transcript events
                </span>
                <span className="rounded-full border border-cyan-200/14 bg-[rgba(255,255,255,0.05)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                  {reviewFlags.length} open review flags
                </span>
                <span className="rounded-full border border-cyan-200/14 bg-[rgba(255,255,255,0.05)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                  {queuedTranscriptEventCount} queued
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
            <AmbientTranscriptWorkspace
              turns={turns}
              participants={participants}
              selectedTurnId={selectedTurnId}
              onSelectTurn={setSelectedTurnId}
              onRelabelSpeaker={relabelSpeaker}
              onExcludeTurn={excludeTurn}
              onRestoreTurn={restoreTurn}
              onMarkProviderConfirmed={markProviderConfirmed}
              onOpenSpeakerCorrection={(turnId) => {
                setSelectedTurnId(turnId);
                setSpeakerDrawerOpen(true);
              }}
            />

            <AmbientDraftReviewPanel
              sections={sections}
              reviewFlags={reviewFlags}
              onAcceptSentence={acceptSentence}
              onRejectSentence={rejectSentence}
              onEditSentence={editSentence}
              onJumpToSource={setSelectedTurnId}
              onAcceptSection={acceptSection}
            />
          </div>

          <div className="rounded-[24px] border border-cyan-200/12 bg-[rgba(255,255,255,0.04)] p-4 text-cyan-50">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Ambient handoff to source capture</div>
                <div className="mt-1 text-base font-semibold text-white">Move reviewed transcript into the shared note pipeline</div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-cyan-50/74">
                  {ambientHandoffStepLabel}. This handoff keeps transcript-derived content reviewable without letting it bypass the note workspace.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/60">Accepted draft sentences</div>
                  <div className="mt-1 text-lg font-semibold text-white">{acceptedSentenceCount}</div>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/60">Blocked sentences</div>
                  <div className="mt-1 text-lg font-semibold text-white">{blockedSentenceCount}</div>
                </div>
                <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/60">Speaker review pending</div>
                  <div className="mt-1 text-lg font-semibold text-white">{unresolvedSpeakerTurns.length}</div>
                </div>
              </div>
            </div>

            <div className={`mt-4 rounded-[18px] border px-4 py-3 text-sm ${
              transcriptReadyForSource
                ? 'border-emerald-300/18 bg-[rgba(16,185,129,0.12)] text-emerald-50'
                : 'border-amber-300/18 bg-[rgba(245,158,11,0.12)] text-amber-50'
            }`}>
              {transcriptReadyForSource
                ? AMBIENT_SOURCE_HANDOFF_CONTRACT.readyMessage
                : AMBIENT_SOURCE_HANDOFF_CONTRACT.blockedMessage}
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onCommitTranscriptToSource(transcriptSourceText, 'replace')}
                disabled={!transcriptReadyForSource}
                className="aurora-primary-button rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Load into Ambient Transcript source
              </button>
              <button
                type="button"
                onClick={() => onCommitTranscriptToSource(transcriptSourceText, 'append')}
                disabled={!transcriptReadyForSource}
                className="aurora-secondary-button rounded-xl px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Append to Ambient Transcript source
              </button>
              <button
                type="button"
                onClick={onOpenDraftControls}
                className="aurora-secondary-button rounded-xl px-4 py-2.5 text-sm font-medium"
              >
                Open draft controls
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[22px] border border-cyan-200/12 bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-cyan-50/78">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/66">Transcript lane</div>
              <div className="mt-1 font-semibold text-white">Ambient transcript review lives in its own source mode</div>
              <p className="mt-1 max-w-2xl leading-6 text-cyan-50/72">
                Keep ambient capture at the encounter level, then switch to Transcript mode to review speakers, exclusions, and evidence-linked draft material before sending it into the note.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-200/14 bg-[rgba(255,255,255,0.05)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-50">
                {sessionState.replace(/_/g, ' ')}
              </span>
              <button
                type="button"
                onClick={onOpenTranscriptMode}
                className="aurora-secondary-button rounded-xl px-4 py-2.5 text-sm font-medium"
              >
                Open transcript mode
              </button>
            </div>
          </div>
        </div>
      )}

      <AmbientConsentGateSheet
        open={consentOpen}
        participants={participants}
        consentDrafts={consentDrafts}
        onChangeDraft={updateConsentDraft}
        onConfirmReady={confirmConsentReady}
        onCancel={() => {
          setConsentOpen(false);
          setSessionState('idle');
        }}
      />

      <AmbientSpeakerCorrectionDrawer
        open={speakerDrawerOpen}
        turn={selectedTurn}
        participantOptions={participants}
        onAssignRole={relabelSpeaker}
        onAssignSpeakerLabel={setSpeakerLabel}
        onMarkUnresolved={markUnresolved}
        onClose={() => setSpeakerDrawerOpen(false)}
      />
    </div>
  );
}
