'use client';

import { useEffect, useRef, useState } from 'react';
import { AmbientConsentGateSheet } from '@/components/note/ambient/ambient-consent-gate-sheet';
import { AmbientControlBar } from '@/components/note/ambient/ambient-control-bar';
import { AmbientDraftReviewPanel } from '@/components/note/ambient/ambient-draft-review-panel';
import { AmbientSessionLauncher } from '@/components/note/ambient/ambient-session-launcher';
import { AmbientSpeakerCorrectionDrawer } from '@/components/note/ambient/ambient-speaker-correction-drawer';
import { AmbientTranscriptWorkspace } from '@/components/note/ambient/ambient-transcript-workspace';
import {
  getAmbientMockConsentDrafts,
  getAmbientMockParticipants,
  getAmbientMockSetupDraft,
  type AmbientConsentEventDraft,
  type AmbientDraftSectionViewModel,
  type AmbientSessionSetupDraft,
  type AmbientTranscriptTurnViewModel,
} from '@/lib/ambient-listening/mock-data';
import type {
  AmbientParticipant,
  AmbientParticipantRole,
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
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
  transcriptEventCount: number;
};

type AmbientTransportLedgerEntry = {
  id: string;
  tone: 'neutral' | 'positive' | 'warning';
  occurredAt: string;
  text: string;
};

type AmbientStreamStatus = 'idle' | 'connecting' | 'connected' | 'degraded';

type AmbientTranscriptEventPayload = {
  id: string;
  eventType: 'interim_turn' | 'final_turn';
  occurredAt: string;
  sourceKind: 'mock_seeded' | 'live_stream_adapter';
  deliveryTransport: 'polling_pull' | 'stream_push';
  turn: Pick<AmbientTranscriptTurnViewModel, 'speakerRole' | 'speakerLabel' | 'attributionNeedsReview'>;
};

const TRANSCRIPT_STALL_WARNING_MS = 6000;

function prependTransportLedgerEntry(
  current: AmbientTransportLedgerEntry[],
  entry: AmbientTransportLedgerEntry,
) {
  return [entry, ...current].slice(0, 6);
}

function formatTransportTimestamp(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function describeTranscriptEvent(event: AmbientTranscriptEventPayload) {
  const speakerDescriptor = event.turn.speakerLabel || event.turn.speakerRole.replace(/_/g, ' ');
  const eventLabel = event.eventType === 'final_turn' ? 'final turn' : 'interim turn';
  const reviewSuffix = event.turn.attributionNeedsReview ? ' awaiting speaker review' : '';
  const sourceLabel = event.sourceKind === 'mock_seeded' ? 'mock queue' : 'live adapter';
  const deliveryLabel = event.deliveryTransport === 'polling_pull' ? 'polling pull' : 'stream push';

  return `${eventLabel} from ${speakerDescriptor}${reviewSuffix}. ${sourceLabel} via ${deliveryLabel}.`;
}

function describeTransportMode(sourceKind: AmbientTranscriptSourceKind) {
  if (sourceKind === 'live_stream_adapter') {
    return {
      title: 'Live adapter simulation',
      body: 'Session-state updates and transcript events travel over SSE so we can pressure-test stream-push behavior before real STT wiring.',
      cadence: 'Expect pushed transcript events every ~1.2s while recording is active.',
    };
  }

  if (sourceKind === 'mock_seeded') {
    return {
      title: 'Buffered replay simulation',
      body: 'Transcript events are queued and drained over polling so we can validate buffered replay, review gating, and post-stop flush behavior.',
      cadence: 'Expect one queued transcript event to drain every ~1.2s while recording is active.',
    };
  }

  return {
    title: 'Transport pending',
    body: 'The ambient shell has not begun transcript delivery yet.',
    cadence: 'Transport cadence will appear after recording starts.',
  };
}

export function AmbientInternalWorkbench() {
  const [setupDraft, setSetupDraft] = useState(getAmbientMockSetupDraft);
  const [participants, setParticipants] = useState<AmbientParticipant[]>(getAmbientMockParticipants);
  const [consentDrafts, setConsentDrafts] = useState<AmbientConsentEventDraft[]>(getAmbientMockConsentDrafts);
  const [sessionState, setSessionState] = useState<AmbientSessionState>('idle');
  const [consentOpen, setConsentOpen] = useState(false);
  const [turns, setTurns] = useState<AmbientTranscriptTurnViewModel[]>([]);
  const [sections, setSections] = useState<AmbientDraftSectionViewModel[]>([]);
  const [reviewFlags, setReviewFlags] = useState<AmbientReviewFlag[]>([]);
  const [selectedTurnId, setSelectedTurnId] = useState<string>('turn-2');
  const [speakerDrawerOpen, setSpeakerDrawerOpen] = useState(false);
  const [jumpedTurnId, setJumpedTurnId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [encounterId] = useState('ambient-internal-encounter');
  const [transcriptEventCount, setTranscriptEventCount] = useState(0);
  const [queuedTranscriptEventCount, setQueuedTranscriptEventCount] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<AmbientStreamStatus>('idle');
  const [pollingActive, setPollingActive] = useState(false);
  const [lastTranscriptEventAt, setLastTranscriptEventAt] = useState<string | null>(null);
  const [transportLedger, setTransportLedger] = useState<AmbientTransportLedgerEntry[]>([]);
  const previousTranscriptEventCountRef = useRef(0);
  const currentSessionIdRef = useRef<string | null>(null);
  const lastTransportWarningRef = useRef<string | null>(null);
  const lastTransportPhaseRef = useRef<AmbientTranscriptTransportPhase | null>(null);
  const lastTranscriptSourceRef = useRef<AmbientTranscriptSourceKind | null>(null);
  const lastDeliveryTransportRef = useRef<AmbientTranscriptDeliveryTransport | null>(null);
  const [transcriptSourceKind, setTranscriptSourceKind] = useState<AmbientTranscriptSourceKind>('none');
  const [transcriptTransportPhase, setTranscriptTransportPhase] = useState<AmbientTranscriptTransportPhase>('idle');
  const [transcriptDeliveryTransport, setTranscriptDeliveryTransport] = useState<AmbientTranscriptDeliveryTransport>('none');
  const [transcriptAdapterId, setTranscriptAdapterId] = useState('ambient-buffered-mock');
  const [transcriptAdapterLabel, setTranscriptAdapterLabel] = useState('Buffered mock transcript queue');

  useEffect(() => {
    if (!['recording', 'paused', 'off_record'].includes(sessionState)) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setElapsedSeconds((current) => (sessionState === 'recording' ? current + 1 : current));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [sessionState]);

  useEffect(() => {
    if (!jumpedTurnId) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setJumpedTurnId(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [jumpedTurnId]);

  useEffect(() => {
    if (!sessionId) {
      setStreamStatus('idle');
      return undefined;
    }

    setStreamStatus('connecting');
    const stream = new EventSource(`/api/ambient/sessions/${sessionId}?stream=1`);

    const handleSessionState = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as AmbientSessionPayload;
        setStreamStatus('connected');
        applySession(payload);
      } catch {
        // Keep the workbench usable even if one stream event is malformed.
      }
    };

    const handleTranscriptEvent = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as AmbientTranscriptEventPayload;
        setStreamStatus('connected');
        setLastTranscriptEventAt(payload.occurredAt);
        setTransportLedger((current) => prependTransportLedgerEntry(current, {
          id: payload.id,
          tone: 'positive',
          occurredAt: payload.occurredAt,
          text: describeTranscriptEvent(payload),
        }));
      } catch {
        // Keep the workbench usable even if one transcript event is malformed.
      }
    };

    stream.addEventListener('session_state', handleSessionState as EventListener);
    stream.addEventListener('transcript_event', handleTranscriptEvent as EventListener);
    stream.onerror = () => {
      setStreamStatus('degraded');
    };

    return () => {
      stream.removeEventListener('session_state', handleSessionState as EventListener);
      stream.removeEventListener('transcript_event', handleTranscriptEvent as EventListener);
      stream.close();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || sessionState !== 'recording' || transcriptSourceKind === 'live_stream_adapter') {
      setPollingActive(false);
      return undefined;
    }

    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight) {
        return;
      }

      inFlight = true;
      setPollingActive(true);
      try {
        await pullTranscriptEvents();
      } catch (error) {
        if (!cancelled) {
          setRequestError(error instanceof Error ? error.message : 'Ambient polling failed.');
        }
      } finally {
        inFlight = false;
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

  useEffect(() => {
    const sessionChanged = currentSessionIdRef.current !== sessionId;

    if (sessionChanged) {
      currentSessionIdRef.current = sessionId;
      previousTranscriptEventCountRef.current = 0;
      lastTransportPhaseRef.current = null;
      lastTranscriptSourceRef.current = null;
      lastDeliveryTransportRef.current = null;
      setLastTranscriptEventAt(null);
      setTranscriptSourceKind('none');
      setTranscriptTransportPhase('idle');
      setTranscriptDeliveryTransport('none');
      setTranscriptAdapterId('ambient-buffered-mock');
      setTranscriptAdapterLabel('Buffered mock transcript queue');
      setTransportLedger(sessionId ? [{
        id: `${Date.now()}-session`,
        tone: 'neutral',
        occurredAt: new Date().toISOString(),
        text: 'Ambient session initialized. Waiting for transcript transport activity.',
      }] : []);
      return;
    }

    previousTranscriptEventCountRef.current = transcriptEventCount;
  }, [sessionId, transcriptEventCount]);

  const selectedTurn = turns.find((turn) => turn.id === selectedTurnId) || null;
  const consentReady = consentDrafts.every((draft) => draft.status === 'granted');
  const transportDegraded = streamStatus === 'degraded';
  const transcriptLaneIdleForCurrentSource = transcriptSourceKind === 'live_stream_adapter'
    ? streamStatus !== 'connected'
    : !pollingActive;
  const hasTranscriptStall = sessionState === 'recording'
    && queuedTranscriptEventCount > 0
    && transcriptLaneIdleForCurrentSource
    && (lastTranscriptEventAt
      ? Date.now() - new Date(lastTranscriptEventAt).getTime() > TRANSCRIPT_STALL_WARNING_MS
      : elapsedSeconds >= 7);
  const transcriptDeliveryLabel = lastTranscriptEventAt
    ? `${transcriptEventCount} delivered, last activity ${Math.max(0, Math.round((Date.now() - new Date(lastTranscriptEventAt).getTime()) / 1000))}s ago`
    : transcriptEventCount
      ? `${transcriptEventCount} delivered`
      : 'Awaiting transcript events';
  const transportModeSummary = describeTransportMode(transcriptSourceKind);
  const transportWarning = hasTranscriptStall
    ? 'Transcript delivery looks stalled while recording is active. Review stream health and queued event flow before trusting the live ambient feed.'
    : transportDegraded
      ? 'Session-state stream degraded. Ambient transcript polling is acting as the fallback transport.'
      : null;

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    if (transcriptSourceKind !== 'none' && lastTranscriptSourceRef.current !== transcriptSourceKind) {
      lastTranscriptSourceRef.current = transcriptSourceKind;
      setTransportLedger((current) => prependTransportLedgerEntry(current, {
        id: `${Date.now()}-source`,
        tone: 'neutral',
        occurredAt: new Date().toISOString(),
        text: `Transcript source is ${transcriptSourceKind.replace(/_/g, ' ')}.`,
      }));
    }

    if ((transcriptTransportPhase !== 'idle' || transcriptSourceKind !== 'none') && lastTransportPhaseRef.current !== transcriptTransportPhase) {
      lastTransportPhaseRef.current = transcriptTransportPhase;
      setTransportLedger((current) => prependTransportLedgerEntry(current, {
        id: `${Date.now()}-phase`,
        tone: 'neutral',
        occurredAt: new Date().toISOString(),
        text: `Transport phase is ${transcriptTransportPhase.replace(/_/g, ' ')}.`,
      }));
    }

    if (transcriptDeliveryTransport !== 'none' && lastDeliveryTransportRef.current !== transcriptDeliveryTransport) {
      lastDeliveryTransportRef.current = transcriptDeliveryTransport;
      setTransportLedger((current) => prependTransportLedgerEntry(current, {
        id: `${Date.now()}-delivery`,
        tone: 'neutral',
        occurredAt: new Date().toISOString(),
        text: `Transcript delivery lane is ${transcriptDeliveryTransport.replace(/_/g, ' ')}.`,
      }));
    }
  }, [sessionId, transcriptSourceKind, transcriptTransportPhase, transcriptDeliveryTransport]);

  useEffect(() => {
    if (!transportWarning || lastTransportWarningRef.current === transportWarning) {
      if (!transportWarning) {
        lastTransportWarningRef.current = null;
      }
      return;
    }

    lastTransportWarningRef.current = transportWarning;
    setTransportLedger((current) => prependTransportLedgerEntry(current, {
      id: `${Date.now()}-warning`,
      tone: 'warning',
      occurredAt: new Date().toISOString(),
      text: transportWarning,
    }));
  }, [transportWarning]);

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
    setTranscriptAdapterId(session.transcriptAdapterId);
    setTranscriptAdapterLabel(session.transcriptAdapterLabel);
    setTranscriptSourceKind(session.transcriptSourceKind);
    setTranscriptTransportPhase(session.transcriptTransportPhase);
    setTranscriptDeliveryTransport(session.transcriptDeliveryTransport);

    if (session.turns.length && !session.turns.some((turn) => turn.id === selectedTurnId)) {
      setSelectedTurnId(session.turns[0].id);
    }
  }

  async function createSession() {
    const response = await fetch('/api/ambient/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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

    const response = await fetch(`/api/ambient/sessions/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action),
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

    const response = await fetch(`/api/ambient/sessions/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'pull_events',
      }),
    });

    const payload = await response.json() as {
      session?: AmbientSessionPayload;
      transcriptEvents?: AmbientTranscriptEventPayload[];
      error?: string;
    };
    if (!response.ok || !payload.session) {
      throw new Error(payload.error || 'Unable to pull ambient transcript events.');
    }

    if (payload.transcriptEvents?.length) {
      const newestOccurredAt = payload.transcriptEvents[payload.transcriptEvents.length - 1]?.occurredAt;
      if (newestOccurredAt) {
        setLastTranscriptEventAt(newestOccurredAt);
      }

      setTransportLedger((current) => payload.transcriptEvents!.reduceRight(
        (ledger, event) => prependTransportLedgerEntry(ledger, {
          id: event.id,
          tone: 'positive',
          occurredAt: event.occurredAt,
          text: describeTranscriptEvent(event),
        }),
        current,
      ));
    }

    applySession(payload.session);
  }

  async function withRequest(action: () => Promise<void>) {
    setRequestError(null);
    try {
      await action();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Ambient request failed.');
    }
  }

  function openConsentGate() {
    void withRequest(async () => {
      await createSession();
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

  function startRecording() {
    void withRequest(async () => {
      setElapsedSeconds(0);
      await updateSession({
        action: 'set_state',
        state: 'recording',
      });
    });
  }

  function pauseRecording() {
    void withRequest(async () => {
      await updateSession({
        action: 'set_state',
        state: 'paused',
      });
    });
  }

  function resumeRecording() {
    void withRequest(async () => {
      await updateSession({
        action: 'set_state',
        state: 'recording',
      });
    });
  }

  function startOffRecord() {
    void withRequest(async () => {
      await updateSession({
        action: 'set_state',
        state: 'off_record',
      });
    });
  }

  function endOffRecord() {
    void withRequest(async () => {
      await updateSession({
        action: 'set_state',
        state: 'recording',
      });
    });
  }

  function stopRecording() {
    void withRequest(async () => {
      await updateSession({ action: 'set_state', state: 'processing_transcript' });
      await updateSession({ action: 'set_state', state: 'draft_generation_pending' });
      await updateSession({ action: 'set_state', state: 'draft_ready' });
    });
  }

  function relabelSpeaker(turnId: string, role: AmbientParticipantRole) {
    void withRequest(async () => {
      await updateSession({
        action: 'relabel_turn',
        turnId,
        role,
      });
    });
  }

  function setSpeakerLabel(turnId: string, speakerLabel: string | null) {
    void withRequest(async () => {
      await updateSession({
        action: 'set_speaker_label',
        turnId,
        speakerLabel,
      });
    });
  }

  function excludeTurn(turnId: string) {
    void withRequest(async () => {
      await updateSession({
        action: 'exclude_turn',
        turnId,
      });
    });
  }

  function restoreTurn(turnId: string) {
    void withRequest(async () => {
      await updateSession({
        action: 'restore_turn',
        turnId,
      });
    });
  }

  function markProviderConfirmed(turnId: string) {
    void withRequest(async () => {
      await updateSession({
        action: 'confirm_turn',
        turnId,
      });
    });
  }

  function markUnresolved(turnId: string) {
    void withRequest(async () => {
      await updateSession({
        action: 'mark_unresolved',
        turnId,
      });
    });
  }

  function acceptSentence(sentenceId: string) {
    void withRequest(async () => {
      await updateSession({
        action: 'accept_sentence',
        sentenceId,
      });
    });
  }

  function rejectSentence(sentenceId: string) {
    void withRequest(async () => {
      await updateSession({
        action: 'reject_sentence',
        sentenceId,
      });
    });
  }

  function editSentence(sentenceId: string, text: string) {
    void withRequest(async () => {
      await updateSession({
        action: 'edit_sentence',
        sentenceId,
        text,
      });
    });
  }

  function jumpToSource(turnId: string) {
    setSelectedTurnId(turnId);
    setJumpedTurnId(turnId);
  }

  function acceptSection(sectionId: string) {
    const section = sections.find((item) => item.sectionId === sectionId);
    if (!section) {
      return;
    }

    const firstBlocked = section.sentences.find((sentence) => sentence.blockingFlagIds.length > 0);
    if (firstBlocked) {
      jumpToSource(firstBlocked.primaryTurnIds[0] || 'turn-2');
      return;
    }

    void withRequest(async () => {
      await updateSession({
        action: 'accept_section',
        sectionId,
      });
    });
  }

  const helperText = sessionState === 'needs_review'
    ? 'Speaker attribution or evidence support still needs provider review before draft content should be trusted.'
    : 'This internal shell validates the safer ambient flow before any real capture is enabled.';

  return (
    <section className="aurora-panel rounded-[24px] p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Ambient internal workbench</h3>
          <p className="mt-1 text-sm text-muted">
            This shell now talks to a real internal ambient session bridge: consent, session state, transcript events, and draft review all move through the same mock backend flow.
          </p>
          {requestError ? (
            <p className="mt-2 text-sm text-rose-700">{requestError}</p>
          ) : null}
        </div>
        <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium text-muted">
          Mock session bridge
        </div>
      </div>

      <div className="mt-5 grid gap-6">
        <AmbientSessionLauncher
          enabled
          draft={setupDraft}
          onChange={setSetupDraft}
          onStartSetup={openConsentGate}
        />

        <AmbientControlBar
          enabled
          sessionState={sessionState}
          mode={setupDraft.mode}
          careSetting={setupDraft.careSetting}
          isFloating={false}
          isMinimized={false}
          consentSummaryLabel={consentReady ? 'Consent ready' : 'Consent incomplete'}
          participantSummaryLabel={`${participants.length} participants`}
          providerLabel="Internal provider shell"
          elapsedSeconds={elapsedSeconds}
          helperText={`${helperText}${transcriptEventCount ? ` Transcript events delivered: ${transcriptEventCount}.` : ''}${queuedTranscriptEventCount ? ` Pending: ${queuedTranscriptEventCount}.` : ''}`}
          streamStatus={streamStatus}
          pollingActive={pollingActive || (sessionState === 'recording' && Boolean(sessionId))}
          transcriptAdapterLabel={transcriptAdapterLabel}
          transcriptSourceKind={transcriptSourceKind}
          transcriptTransportPhase={transcriptTransportPhase}
          transcriptDeliveryTransport={transcriptDeliveryTransport}
          transcriptDeliveryLabel={transcriptDeliveryLabel}
          transportWarning={transportWarning}
          onToggleMinimized={() => {}}
          onToggleFloating={() => {}}
          onStartRecording={startRecording}
          onPauseRecording={pauseRecording}
          onResumeRecording={resumeRecording}
          onOffRecordStart={startOffRecord}
          onOffRecordEnd={endOffRecord}
          onStopRecording={stopRecording}
        />

        <section className="grid gap-4 rounded-[24px] border border-white/10 bg-[rgba(6,12,24,0.44)] p-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/64">Transport health</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/54">Session stream</div>
                <div className="mt-1 text-sm font-semibold text-white">{streamStatus}</div>
                <p className="mt-1 text-xs text-cyan-50/68">
                  SSE carries session-state updates and falls back to transcript polling if degraded.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/54">Transcript pull</div>
                <div className="mt-1 text-sm font-semibold text-white">{pollingActive || (sessionState === 'recording' && Boolean(sessionId)) ? 'active' : 'idle'}</div>
                <p className="mt-1 text-xs text-cyan-50/68">
                  Polling remains the delivery lane for mock transcript events during recording.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/54">Adapter contract</div>
                <div className="mt-1 text-sm font-semibold text-white">{transcriptAdapterLabel}</div>
                <p className="mt-1 text-xs text-cyan-50/68">
                  {transcriptAdapterId}. Future STT providers should implement this same transcript-event contract without changing review behavior.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/54">Transport phase</div>
                <div className="mt-1 text-sm font-semibold text-white">{transcriptTransportPhase.replace(/_/g, ' ')}</div>
                <p className="mt-1 text-xs text-cyan-50/68">
                  This distinguishes live streaming, buffered replay, and post-stop flush from the transcript source itself.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/54">Cadence expectation</div>
                <div className="mt-1 text-sm font-semibold text-white">{transportModeSummary.title}</div>
                <p className="mt-1 text-xs text-cyan-50/68">
                  {transportModeSummary.cadence}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/54">Queued events</div>
                <div className="mt-1 text-sm font-semibold text-white">{queuedTranscriptEventCount}</div>
                <p className="mt-1 text-xs text-cyan-50/68">
                  Low-confidence speaker turns still gate acceptance until provider review resolves attribution.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/54">Transcript provenance</div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {transcriptSourceKind.replace(/_/g, ' ')} via {transcriptDeliveryTransport.replace(/_/g, ' ')}
                </div>
                <p className="mt-1 text-xs text-cyan-50/68">
                  {transportModeSummary.body}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/54">Last transcript activity</div>
                <div className="mt-1 text-sm font-semibold text-white">{lastTranscriptEventAt ? `${Math.max(0, Math.round((Date.now() - new Date(lastTranscriptEventAt).getTime()) / 1000))}s ago` : 'None yet'}</div>
                <p className="mt-1 text-xs text-cyan-50/68">
                  Use this to spot stalled transcript flow before draft review starts.
                </p>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/64">Transport ledger</div>
            <div className="mt-2 rounded-[22px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
              {transportLedger.length ? (
                <ul className="space-y-2">
                  {transportLedger.map((entry) => (
                    <li
                      key={entry.id}
                      className={`rounded-2xl border px-3 py-2 text-sm ${
                        entry.tone === 'warning'
                          ? 'border-amber-300/20 bg-[rgba(245,158,11,0.12)] text-amber-50'
                          : entry.tone === 'positive'
                            ? 'border-emerald-300/18 bg-[rgba(16,185,129,0.1)] text-emerald-50'
                            : 'border-white/10 bg-white/6 text-cyan-50/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span>{entry.text}</span>
                        <span className="shrink-0 text-[11px] uppercase tracking-[0.16em] text-current/70">
                          {formatTransportTimestamp(entry.occurredAt)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-cyan-50/68">
                  Ambient transport events will appear here once a session begins.
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className={jumpedTurnId ? 'ring-2 ring-cyan-300/40 rounded-[26px]' : ''}>
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
          </div>

          <AmbientDraftReviewPanel
            sections={sections}
            reviewFlags={reviewFlags}
            onAcceptSentence={acceptSentence}
            onRejectSentence={rejectSentence}
            onEditSentence={editSentence}
            onJumpToSource={jumpToSource}
            onAcceptSection={acceptSection}
          />
        </div>
      </div>

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
    </section>
  );
}
