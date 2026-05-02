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
  providerNote,
  providerOptions,
  requestedProviderId,
  allowMockFallback,
  providerStatusLoading,
  sessionStatusLabel,
  targetLabel,
  helperText,
  voiceGuide,
  onVoiceGuideAction,
  onRequestedProviderChange,
  onAllowMockFallbackChange,
  onRefreshProviderStatus,
  onStart,
  onPause,
  onStop,
  onStopAndInsert,
}: {
  enabled: boolean;
  uiState: DictationUiState;
  captureState: DictationCaptureState;
  captureLabel: string;
  providerLabel: string;
  providerNote: string;
  providerOptions: Array<{
    providerId: string;
    providerLabel: string;
    available: boolean;
    engineLabel: string;
  }>;
  requestedProviderId: string;
  allowMockFallback: boolean;
  providerStatusLoading: boolean;
  sessionStatusLabel: string;
  targetLabel: string;
  helperText: string;
  voiceGuide: {
    statusLabel: string;
    headline: string;
    detail: string;
    phrases: string[];
    needsAttention: boolean;
    actionLabel: string;
  };
  onVoiceGuideAction: () => void;
  onRequestedProviderChange: (value: string) => void;
  onAllowMockFallbackChange: (value: boolean) => void;
  onRefreshProviderStatus: () => void;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onStopAndInsert?: () => void;
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
          <div className="mt-2 text-xs text-cyan-50/68">{providerNote}</div>
          <div className={`mt-3 rounded-[18px] border p-3 ${voiceGuide.needsAttention ? 'border-amber-300/20 bg-[rgba(245,158,11,0.08)]' : 'border-white/10 bg-[rgba(255,255,255,0.04)]'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/62">
                {voiceGuide.statusLabel}
              </div>
              <button
                type="button"
                onClick={onVoiceGuideAction}
                className="rounded-xl border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-medium text-cyan-50/82"
              >
                {voiceGuide.actionLabel}
              </button>
            </div>
            <div className="mt-2 text-sm font-medium text-white">{voiceGuide.headline}</div>
            <div className="mt-1 text-xs leading-5 text-cyan-50/72">{voiceGuide.detail}</div>
            {voiceGuide.phrases.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {voiceGuide.phrases.map((phrase) => (
                  <span key={phrase} className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] text-cyan-50/76">
                    {phrase}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mt-3 grid gap-2 lg:max-w-2xl lg:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="text-xs text-cyan-50/74">
              <span className="mb-1 block uppercase tracking-[0.12em] text-cyan-100/62">Requested provider</span>
              <select
                value={requestedProviderId}
                onChange={(event) => onRequestedProviderChange(event.target.value)}
                className="w-full rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm text-cyan-50"
                disabled={isListening}
              >
                {providerOptions.map((option) => (
                  <option key={option.providerId} value={option.providerId}>
                    {option.providerLabel} • {option.engineLabel} {option.available ? '' : '(unavailable)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end gap-2 rounded-xl border border-white/12 bg-white/6 px-3 py-2 text-xs text-cyan-50/76">
              <input
                type="checkbox"
                checked={allowMockFallback}
                onChange={(event) => onAllowMockFallbackChange(event.target.checked)}
                disabled={isListening}
              />
              Allow mock fallback
            </label>
            <button
              type="button"
              onClick={onRefreshProviderStatus}
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-medium text-cyan-50/82"
            >
              {providerStatusLoading ? 'Refreshing...' : 'Refresh status'}
            </button>
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
          {onStopAndInsert ? (
            <button
              type="button"
              onClick={onStopAndInsert}
              disabled={!enabled || uiState !== 'listening'}
              className="rounded-xl bg-[rgba(251,191,36,0.18)] px-3 py-2 text-sm font-medium text-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Stop & Insert
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
