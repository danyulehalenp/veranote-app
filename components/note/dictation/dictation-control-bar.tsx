'use client';

import type { DictationCaptureState, DictationUiState } from '@/types/dictation';

function getTone(uiState: DictationUiState) {
  if (uiState === 'listening' || uiState === 'interim') {
    return 'border-emerald-300/24 bg-[rgba(16,185,129,0.12)] text-emerald-50';
  }

  if (uiState === 'error') {
    return 'border-rose-300/24 bg-[rgba(244,63,94,0.12)] text-rose-50';
  }

  return 'border-cyan-200/12 bg-[rgba(255,255,255,0.04)] text-cyan-50';
}

export function DictationControlBar({
  enabled,
  uiState,
  captureState,
  captureLabel,
  providerLabel,
  sessionStatusLabel,
  targetLabel,
  helperText,
  onStart,
  onPause,
  onStop,
}: {
  enabled: boolean;
  uiState: DictationUiState;
  captureState: DictationCaptureState;
  captureLabel: string;
  providerLabel: string;
  sessionStatusLabel: string;
  targetLabel: string;
  helperText: string;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
}) {
  const isListening = uiState === 'listening' || uiState === 'interim' || uiState === 'final_ready';

  return (
    <div className={`rounded-[22px] border p-4 shadow-[0_18px_48px_rgba(2,8,18,0.18)] ${getTone(uiState)}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/64">Provider dictation</div>
          <div className="mt-1 text-base font-semibold text-white">{targetLabel}</div>
          <p className="mt-1 text-sm text-cyan-50/74">{helperText}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-cyan-50/72">
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">
              Capture: {captureLabel}
            </span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">
              Session: {enabled ? uiState.replace(/_/g, ' ') : 'not available'}
            </span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">
              Provider: {providerLabel}
            </span>
            <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 font-medium">
              Backend: {sessionStatusLabel}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-50/78">
            {captureState.replace(/_/g, ' ')}
          </span>
          <button
            type="button"
            onClick={onStart}
            disabled={!enabled || isListening}
            className="rounded-xl bg-[rgba(34,197,94,0.18)] px-3 py-2 text-sm font-medium text-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start
          </button>
          <button
            type="button"
            onClick={onPause}
            disabled={!enabled || !isListening}
            className="rounded-xl bg-[rgba(56,189,248,0.16)] px-3 py-2 text-sm font-medium text-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Pause
          </button>
          <button
            type="button"
            onClick={onStop}
            disabled={!enabled || uiState === 'idle' || uiState === 'stopped'}
            className="rounded-xl bg-[rgba(244,63,94,0.16)] px-3 py-2 text-sm font-medium text-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}
