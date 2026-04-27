'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import type {
  AmbientCareSetting,
  AmbientListeningMode,
  AmbientSessionState,
  AmbientTranscriptDeliveryTransport,
  AmbientTranscriptSourceKind,
  AmbientTranscriptTransportPhase,
} from '@/types/ambient-listening';

type AmbientTransportStatus = 'idle' | 'connecting' | 'connected' | 'degraded';

function toneForState(sessionState: AmbientSessionState) {
  if (sessionState === 'recording') {
    return 'border-emerald-300/24 bg-[rgba(16,185,129,0.12)] text-emerald-50';
  }

  if (sessionState === 'off_record') {
    return 'border-amber-300/24 bg-[rgba(245,158,11,0.14)] text-amber-50';
  }

  if (sessionState === 'needs_review') {
    return 'border-rose-300/24 bg-[rgba(244,63,94,0.12)] text-rose-50';
  }

  return 'border-cyan-200/12 bg-[rgba(255,255,255,0.04)] text-cyan-50';
}

function toneForTransport(status: AmbientTransportStatus) {
  if (status === 'connected') {
    return 'border-emerald-300/24 bg-[rgba(16,185,129,0.12)] text-emerald-50';
  }

  if (status === 'connecting') {
    return 'border-sky-300/24 bg-[rgba(56,189,248,0.14)] text-sky-50';
  }

  if (status === 'degraded') {
    return 'border-amber-300/24 bg-[rgba(245,158,11,0.18)] text-amber-50';
  }

  return 'border-white/12 bg-white/8 text-cyan-50/78';
}

function toneForTranscriptSource(sourceKind: AmbientTranscriptSourceKind) {
  if (sourceKind === 'live_stream_adapter') {
    return 'border-sky-300/24 bg-[rgba(56,189,248,0.16)] text-sky-50';
  }

  if (sourceKind === 'mock_seeded') {
    return 'border-violet-300/20 bg-[rgba(129,140,248,0.14)] text-indigo-50';
  }

  return 'border-white/12 bg-white/8 text-cyan-50/78';
}

export function AmbientControlBar({
  enabled,
  sessionState,
  mode,
  careSetting,
  isFloating,
  isMinimized,
  eyebrowLabel,
  titleLabel,
  consentSummaryLabel,
  participantSummaryLabel,
  providerLabel,
  elapsedSeconds,
  helperText,
  streamStatus,
  pollingActive,
  transcriptAdapterLabel,
  transcriptSourceKind,
  transcriptTransportPhase,
  transcriptDeliveryTransport,
  transcriptDeliveryLabel,
  transportWarning,
  onToggleMinimized,
  onToggleFloating,
  onResetFloatingPosition,
  onDragHandlePointerDown,
  startLabel,
  stopLabel,
  onPrepareSession,
  onStartRecording,
  onPauseRecording,
  onResumeRecording,
  onOffRecordStart,
  onOffRecordEnd,
  onStopRecording,
}: {
  enabled: boolean;
  sessionState: AmbientSessionState;
  mode: AmbientListeningMode;
  careSetting: AmbientCareSetting;
  isFloating: boolean;
  isMinimized: boolean;
  eyebrowLabel?: string;
  titleLabel?: string;
  consentSummaryLabel: string;
  participantSummaryLabel: string;
  providerLabel: string;
  elapsedSeconds: number;
  helperText: string;
  streamStatus: AmbientTransportStatus;
  pollingActive: boolean;
  transcriptAdapterLabel: string;
  transcriptSourceKind: AmbientTranscriptSourceKind;
  transcriptTransportPhase: AmbientTranscriptTransportPhase;
  transcriptDeliveryTransport: AmbientTranscriptDeliveryTransport;
  transcriptDeliveryLabel: string;
  transportWarning?: string | null;
  onToggleMinimized: () => void;
  onToggleFloating: () => void;
  onResetFloatingPosition?: () => void;
  onDragHandlePointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  startLabel?: string;
  stopLabel?: string;
  onPrepareSession?: () => void;
  onStartRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onOffRecordStart: () => void;
  onOffRecordEnd: () => void;
  onStopRecording: () => void;
}) {
  const isRecording = sessionState === 'recording';
  const isPaused = sessionState === 'paused';
  const isOffRecord = sessionState === 'off_record';
  const canStart = sessionState === 'ready_to_record';
  const needsPreparation = sessionState === 'idle' || sessionState === 'consent_pending';
  const simulatorBadgeLabel = transcriptSourceKind === 'live_stream_adapter'
    ? 'Live adapter simulation'
    : transcriptSourceKind === 'mock_seeded'
      ? 'Buffered replay simulation'
      : 'Transport pending';
  const cadenceHint = transcriptSourceKind === 'live_stream_adapter'
    ? 'Transcript events should arrive over SSE roughly every 1.2s while recording remains active.'
    : transcriptSourceKind === 'mock_seeded'
      ? 'Transcript events should drain over polling roughly every 1.2s from the buffered mock queue.'
      : 'Transcript transport will initialize after consent and recording start.';
  const primaryStartLabel = startLabel
    || (needsPreparation ? 'Start ambient session' : 'Start recording');
  const primaryStopLabel = stopLabel || 'Stop';
  const handlePrimaryStart = needsPreparation && onPrepareSession ? onPrepareSession : onStartRecording;
  const shellTone = toneForState(sessionState);
  const chromeLabel = isFloating ? 'Floating ambient control' : 'Docked ambient control';

  if (isMinimized) {
    return (
      <section className={`rounded-[22px] border p-3 shadow-[0_18px_48px_rgba(2,8,18,0.18)] backdrop-blur-xl ${shellTone}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/64">{eyebrowLabel || 'Ambient internal session'}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-white">{chromeLabel}</span>
              <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[11px] font-medium text-cyan-50/78">
                {sessionState.replace(/_/g, ' ')}
              </span>
              <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[11px] font-medium text-cyan-50/78">
                {transcriptDeliveryLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {isFloating ? (
              <button
                type="button"
                onPointerDown={onDragHandlePointerDown}
                className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-medium text-cyan-50"
              >
                Drag
              </button>
            ) : null}
            <button
              type="button"
              onClick={onToggleFloating}
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-medium text-cyan-50"
            >
              {isFloating ? 'Dock' : 'Float'}
            </button>
            {isFloating && onResetFloatingPosition ? (
              <button
                type="button"
                onClick={onResetFloatingPosition}
                className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-medium text-cyan-50"
              >
                Reset
              </button>
            ) : null}
            <button
              type="button"
              onClick={onToggleMinimized}
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-medium text-cyan-50"
            >
              Expand
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`rounded-[24px] border p-4 shadow-[0_18px_48px_rgba(2,8,18,0.18)] backdrop-blur-xl ${shellTone}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/64">{eyebrowLabel || 'Ambient internal session'}</div>
            <span className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[11px] font-medium text-cyan-50/78">
              {chromeLabel}
            </span>
          </div>
          <div className="mt-1 text-base font-semibold text-white">
            {titleLabel || `${mode.replace(/_/g, ' ')} • ${careSetting.replace(/_/g, ' ')}`}
          </div>
          <p className="mt-1 text-sm text-cyan-50/74">{helperText}</p>
          <div className="mt-2 text-xs font-medium text-cyan-50/70">
            Adapter contract: {transcriptAdapterLabel}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneForTranscriptSource(transcriptSourceKind)}`}>
              {simulatorBadgeLabel}
            </span>
            <span className="text-xs text-cyan-50/72">
              {cadenceHint}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-cyan-50/74">
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">Session: {sessionState.replace(/_/g, ' ')}</span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">{consentSummaryLabel}</span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">{participantSummaryLabel}</span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">Provider: {providerLabel}</span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">Elapsed: {elapsedSeconds}s</span>
            <span className={`rounded-full border px-3 py-1 font-medium ${toneForTransport(streamStatus)}`}>
              Stream: {streamStatus}
            </span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">
              Source: {transcriptSourceKind.replace(/_/g, ' ')}
            </span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">
              Phase: {transcriptTransportPhase.replace(/_/g, ' ')}
            </span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">
              Delivery lane: {transcriptDeliveryTransport.replace(/_/g, ' ')}
            </span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">
              Transcript pull: {pollingActive ? 'active' : 'idle'}
            </span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">
              Delivery: {transcriptDeliveryLabel}
            </span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">Draft only</span>
          </div>
          {transportWarning ? (
            <p className="mt-3 rounded-2xl border border-amber-300/20 bg-[rgba(245,158,11,0.12)] px-3 py-2 text-xs font-medium text-amber-50">
              {transportWarning}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isFloating ? (
            <button
              type="button"
              onPointerDown={onDragHandlePointerDown}
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-medium text-cyan-50"
            >
              Drag
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleFloating}
            className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-medium text-cyan-50"
          >
            {isFloating ? 'Dock' : 'Float'}
          </button>
          {isFloating && onResetFloatingPosition ? (
            <button
              type="button"
              onClick={onResetFloatingPosition}
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-medium text-cyan-50"
            >
              Reset position
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleMinimized}
            className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-medium text-cyan-50"
          >
            Minimize
          </button>
          <button
            type="button"
            onClick={handlePrimaryStart}
            disabled={!enabled || (needsPreparation ? !onPrepareSession : !canStart)}
            className="rounded-xl bg-[rgba(34,197,94,0.18)] px-3 py-2 text-sm font-medium text-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {primaryStartLabel}
          </button>
          <button
            type="button"
            onClick={isPaused ? onResumeRecording : onPauseRecording}
            disabled={!enabled || (!isRecording && !isPaused)}
            className="rounded-xl bg-[rgba(56,189,248,0.16)] px-3 py-2 text-sm font-medium text-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            onClick={isOffRecord ? onOffRecordEnd : onOffRecordStart}
            disabled={!enabled || (!isRecording && !isOffRecord)}
            className="rounded-xl bg-[rgba(245,158,11,0.18)] px-3 py-2 text-sm font-medium text-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isOffRecord ? 'Return to record' : 'Off record'}
          </button>
          <button
            type="button"
            onClick={onStopRecording}
            disabled={!enabled || ['idle', 'consent_pending', 'ready_to_record', 'discarded', 'accepted_into_note', 'finalized'].includes(sessionState)}
            className="rounded-xl bg-[rgba(244,63,94,0.16)] px-3 py-2 text-sm font-medium text-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {primaryStopLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
