'use client';

import { type PointerEvent as ReactPointerEvent, useState } from 'react';
import { AssistantPersonaAvatar } from '@/components/veranote/assistant/assistant-persona-avatar';
import {
  MINI_VERANOTE_SOURCE_TARGETS,
  buildMiniVeranoteDesktopHandoff,
  getMiniVeranoteTargetLabel,
  type MiniVeranotePayloadMode,
  type MiniVeranoteSourceTarget,
} from '@/lib/veranote/mini-veranote-overlay';
import { clampMiniOverlayPosition, useMiniVeranoteOverlayState } from '@/components/note/use-mini-veranote-overlay';
import type { ProviderSettings } from '@/lib/constants/settings';
import type { SourceSections } from '@/types/session';

type MiniVeranoteOverlayProps = {
  enabled: boolean;
  assistantName: string;
  assistantAvatar: ProviderSettings['userAiAvatar'];
  noteType: string;
  specialty: string;
  outputDestination: string;
  sourceSections: SourceSections;
  sourceInput: string;
  currentDraftText: string;
  hasSource: boolean;
  isGenerating: boolean;
  providerIdentityId: string;
  onAppendToSource: (target: MiniVeranoteSourceTarget, text: string) => void;
  onOpenDictation: () => void;
  onOpenAmbient: () => void;
  onOpenAtlas: () => void;
  onGenerateDraft: () => void;
};

export function MiniVeranoteOverlay({
  enabled,
  assistantName,
  assistantAvatar,
  noteType,
  specialty,
  outputDestination,
  sourceSections,
  sourceInput,
  currentDraftText,
  hasSource,
  isGenerating,
  providerIdentityId,
  onAppendToSource,
  onOpenDictation,
  onOpenAmbient,
  onOpenAtlas,
  onGenerateDraft,
}: MiniVeranoteOverlayProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('Mini Veranote ready');
  const [askStatus, setAskStatus] = useState<'idle' | 'asking'>('idle');
  const overlay = useMiniVeranoteOverlayState({
    enabled,
    noteType,
    outputDestination,
    providerIdentityId,
    sourceSections,
    sourceInput,
    currentDraftText,
  });

  if (!enabled || !overlay.position) {
    return null;
  }

  function beginDrag(event: ReactPointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, select, a, [data-no-mini-drag="true"]')) {
      return;
    }

    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    if (!overlay.position) {
      return;
    }
    const startPosition = { ...overlay.position };
    document.body.style.userSelect = 'none';

    function handlePointerMove(moveEvent: PointerEvent) {
      overlay.setPosition(clampMiniOverlayPosition({
        x: startPosition.x + moveEvent.clientX - startX,
        y: startPosition.y + moveEvent.clientY - startY,
      }, overlay.size));
    }

    function handlePointerUp(moveEvent: PointerEvent) {
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      overlay.setPosition(clampMiniOverlayPosition({
        x: startPosition.x + moveEvent.clientX - startX,
        y: startPosition.y + moveEvent.clientY - startY,
      }, overlay.size));
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function handleAppend() {
    const trimmed = overlay.miniText.trim();
    if (!trimmed) {
      setStatus('Add source text before sending it into the note.');
      return;
    }

    onAppendToSource(overlay.targetSection, trimmed);
    setStatus(`Added to ${getMiniVeranoteTargetLabel(overlay.targetSection)}`);
  }

  async function handleCopyForEhr() {
    if (!overlay.ehrPayload) {
      setStatus('Nothing ready to copy yet.');
      return;
    }

    const handoff = buildMiniVeranoteDesktopHandoff({
      providerIdentityId,
      workflowProfile: overlay.workflowProfile,
      selectedFieldTarget: overlay.selectedFieldTarget,
      sourceTarget: overlay.targetSection,
      payloadMode: overlay.ehrPayloadMode,
      text: overlay.ehrPayload,
    });

    try {
      window.localStorage.setItem(overlay.desktopHandoffStorageKey, JSON.stringify(handoff));
      window.dispatchEvent(new CustomEvent('veranote-mini-overlay-ehr-handoff', { detail: handoff }));
      await navigator.clipboard.writeText(overlay.ehrPayload);
      setStatus(overlay.selectedFieldTarget
        ? `Copied ${overlay.selectedFieldTarget.label} payload`
        : `${overlay.workflowProfile.destinationLabel} payload copied`);
    } catch {
      setStatus('Clipboard copy was not available in this browser.');
    }
  }

  async function handleAskAtlas() {
    const trimmed = question.trim();
    if (!trimmed) {
      setAnswer('Ask a focused question first.');
      return;
    }

    setAskStatus('asking');
    setAnswer('');

    try {
      const response = await fetch('/api/assistant/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: currentDraftText.trim() ? 'review' : 'compose',
          mode: 'workflow-help',
          message: trimmed,
          context: {
            providerIdentityId,
            userAiName: assistantName,
            noteType,
            specialty,
            outputDestination,
            activeSourceMode: 'mini-veranote-overlay',
            currentDraftText: currentDraftText.trim() ? currentDraftText.slice(0, 4000) : undefined,
            customInstructions: overlay.miniText.trim() || undefined,
          },
          recentMessages: [
            {
              role: 'provider',
              content: trimmed,
            },
          ],
        }),
      });
      const payload = await response.json() as { message?: string; error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Atlas did not answer from the mini overlay.');
      }

      setAnswer(payload.message || `${assistantName} answered, but no display text was returned.`);
      setStatus(`${assistantName} answered in Mini Veranote`);
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : 'Atlas did not answer from the mini overlay.');
    } finally {
      setAskStatus('idle');
    }
  }

  return (
    <section
      data-testid={overlay.isMinimized ? 'mini-veranote-dock' : 'mini-veranote-overlay'}
      className="fixed z-[55] overflow-hidden rounded-[24px] border border-teal-100/26 bg-[rgba(5,18,27,0.96)] text-cyan-50 shadow-[0_24px_80px_rgba(2,8,18,0.48)] backdrop-blur-xl"
      style={{
        left: `${overlay.position.x}px`,
        top: `${overlay.position.y}px`,
        width: `${overlay.size.width}px`,
        maxWidth: 'calc(100vw - 24px)',
        height: `${overlay.size.height}px`,
        maxHeight: 'calc(100vh - 24px)',
      }}
      onPointerDown={beginDrag}
      aria-label="Mini Veranote overlay"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex cursor-grab items-center gap-3 border-b border-cyan-100/12 bg-white/[0.04] px-3 py-2.5 active:cursor-grabbing">
          <AssistantPersonaAvatar avatar={assistantAvatar} label={assistantName} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/74">Mini Veranote</div>
            <div className="truncate text-xs text-cyan-50/68">{noteType}</div>
          </div>
          <button
            type="button"
            data-no-mini-drag="true"
            onClick={() => overlay.setMinimizedAndPersist(!overlay.isMinimized)}
            className="rounded-full border border-cyan-100/14 bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-cyan-50/78"
          >
            {overlay.isMinimized ? 'Open' : 'Hide'}
          </button>
        </div>

        {overlay.isMinimized ? (
          <button
            type="button"
            data-no-mini-drag="true"
            onClick={() => overlay.setMinimizedAndPersist(false)}
            className="flex flex-1 items-center justify-between gap-3 px-4 text-left text-sm font-semibold text-white"
          >
            <span>Capture, ask, copy</span>
            <span className="rounded-full border border-cyan-100/16 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-cyan-100/74">Ready</span>
          </button>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-3 py-3">
            <div className="grid grid-cols-3 gap-2" aria-label="Mini Veranote capture controls">
              <button
                type="button"
                data-testid="mini-veranote-open-dictation"
                data-no-mini-drag="true"
                onClick={onOpenDictation}
                className="rounded-xl border border-emerald-200/20 bg-emerald-300/10 px-2 py-2 text-xs font-semibold text-emerald-50"
              >
                Dictate
              </button>
              <button
                type="button"
                data-testid="mini-veranote-open-ambient"
                data-no-mini-drag="true"
                onClick={onOpenAmbient}
                className="rounded-xl border border-sky-200/20 bg-sky-300/10 px-2 py-2 text-xs font-semibold text-sky-50"
              >
                Ambient
              </button>
              <button
                type="button"
                data-testid="mini-veranote-open-atlas"
                data-no-mini-drag="true"
                onClick={onOpenAtlas}
                className="rounded-xl border border-cyan-200/20 bg-cyan-300/10 px-2 py-2 text-xs font-semibold text-cyan-50"
              >
                Atlas
              </button>
            </div>

            <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100/62">
              Capture scratch
              <textarea
                data-testid="mini-veranote-source-input"
                data-no-mini-drag="true"
                value={overlay.miniText}
                onChange={(event) => overlay.setMiniText(event.target.value)}
                className="min-h-[104px] resize-none rounded-[16px] border border-cyan-100/14 bg-[rgba(7,18,32,0.74)] p-3 text-sm normal-case leading-5 tracking-normal text-white outline-none focus:border-cyan-100/36"
                placeholder="Jot source while another EHR is open..."
              />
            </label>

            <div className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100/62">
              <div>Send target</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label="Mini Veranote source target">
                {MINI_VERANOTE_SOURCE_TARGETS.map((target) => {
                  const isActive = overlay.targetSection === target.id;
                  return (
                    <button
                      key={target.id}
                      type="button"
                      data-testid={`mini-veranote-target-${target.id}`}
                      data-no-mini-drag="true"
                      aria-pressed={isActive}
                      onClick={() => overlay.setTargetSectionAndPersist(target.id)}
                      className={`rounded-[12px] border px-2 py-1.5 text-[11px] font-semibold transition ${
                        isActive
                          ? 'border-cyan-200/34 bg-cyan-300/14 text-white'
                          : 'border-cyan-100/12 bg-white/[0.04] text-cyan-50/66'
                      }`}
                    >
                      {target.label}
                    </button>
                  );
                })}
              </div>
              <select
                data-testid="mini-veranote-target-select"
                data-no-mini-drag="true"
                aria-label="Mini Veranote source target"
                value={overlay.targetSection}
                onChange={(event) => overlay.setTargetSectionAndPersist(event.target.value as MiniVeranoteSourceTarget)}
                className="rounded-[14px] border border-cyan-100/14 bg-[rgba(7,18,32,0.74)] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-100/36"
              >
                {MINI_VERANOTE_SOURCE_TARGETS.map((target) => (
                  <option key={target.id} value={target.id}>{target.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="mini-veranote-send-source"
                data-no-mini-drag="true"
                onClick={handleAppend}
                className="rounded-xl border border-emerald-200/24 bg-emerald-300/12 px-3 py-2 text-xs font-semibold text-emerald-50"
              >
                Send to source
              </button>
              <button
                type="button"
                data-testid="mini-veranote-copy-ehr"
                data-no-mini-drag="true"
                onClick={() => {
                  void handleCopyForEhr();
                }}
                className="rounded-xl border border-cyan-200/18 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-cyan-50/82"
              >
                Copy for EHR
              </button>
            </div>

            <details className="rounded-[16px] border border-cyan-100/12 bg-white/[0.035] p-3" open>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100/64">
                EHR handoff
              </summary>
              <div className="mt-2 grid gap-2">
                <div className="rounded-[12px] border border-cyan-100/10 bg-[rgba(7,18,32,0.62)] px-3 py-2 text-xs leading-5 text-cyan-50/72">
                  {overlay.workflowProfile.supportsDirectFieldInsertion
                    ? `${overlay.workflowProfile.destinationLabel}: ${overlay.workflowProfile.directFieldGuidance}`
                    : overlay.workflowProfile.directFieldGuidance}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="grid min-w-0 gap-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-cyan-100/58">
                    Copy mode
                    <select
                      data-testid="mini-veranote-copy-mode"
                      data-no-mini-drag="true"
                      value={overlay.ehrPayloadMode}
                      onChange={(event) => overlay.setEhrPayloadModeAndPersist(event.target.value as MiniVeranotePayloadMode)}
                      className="w-full min-w-0 rounded-[12px] border border-cyan-100/14 bg-[rgba(7,18,32,0.74)] px-2 py-1.5 text-xs normal-case tracking-normal text-white"
                    >
                      <option value="smart">Best available</option>
                      <option value="draft">Draft</option>
                      <option value="target-source">Selected source</option>
                      <option value="scratch">Scratch only</option>
                    </select>
                  </label>
                  <label className="grid min-w-0 gap-1 text-[11px] font-semibold uppercase tracking-[0.11em] text-cyan-100/58">
                    EHR field
                    <select
                      data-testid="mini-veranote-ehr-field-select"
                      data-no-mini-drag="true"
                      value={overlay.selectedFieldTarget?.id || ''}
                      onChange={(event) => overlay.setSelectedFieldTargetIdAndPersist(event.target.value)}
                      className="w-full min-w-0 rounded-[12px] border border-cyan-100/14 bg-[rgba(7,18,32,0.74)] px-2 py-1.5 text-xs normal-case tracking-normal text-white"
                    >
                      {overlay.workflowProfile.fieldTargets.length ? overlay.workflowProfile.fieldTargets.map((target) => (
                        <option key={target.id} value={target.id}>{target.label}</option>
                      )) : (
                        <option value="">Main note body</option>
                      )}
                    </select>
                  </label>
                </div>
                <div
                  data-testid="mini-veranote-ehr-preview"
                  className="max-h-24 overflow-y-auto break-words whitespace-pre-wrap rounded-[12px] border border-cyan-100/10 bg-[rgba(7,18,32,0.62)] p-2 text-xs leading-5 text-cyan-50/72"
                >
                  {overlay.ehrPayloadPreview}
                </div>
              </div>
            </details>

            <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100/62">
              Ask Atlas
              <input
                data-testid="mini-veranote-ask-input"
                data-no-mini-drag="true"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleAskAtlas();
                  }
                }}
                className="rounded-[14px] border border-cyan-100/14 bg-[rgba(7,18,32,0.74)] px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-cyan-100/36"
                placeholder={`Ask ${assistantName} from this note...`}
              />
            </label>

            <button
              type="button"
              data-testid="mini-veranote-ask-button"
              data-no-mini-drag="true"
              onClick={() => {
                void handleAskAtlas();
              }}
              disabled={askStatus === 'asking'}
              className="rounded-xl border border-cyan-200/22 bg-cyan-300/12 px-3 py-2 text-xs font-semibold text-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {askStatus === 'asking' ? 'Asking...' : `Ask ${assistantName}`}
            </button>

            {answer ? (
              <div data-testid="mini-veranote-answer" className="max-h-32 overflow-y-auto rounded-[16px] border border-cyan-100/12 bg-white/[0.04] p-3 text-xs leading-5 text-cyan-50/78">
                {answer}
              </div>
            ) : null}

            <div className="mt-auto grid gap-2 border-t border-cyan-100/10 pt-3">
              <div data-testid="mini-veranote-status" className="text-xs leading-5 text-cyan-50/66">{status}</div>
              <button
                type="button"
                data-testid="mini-veranote-generate"
                data-no-mini-drag="true"
                onClick={onGenerateDraft}
                disabled={isGenerating || !hasSource}
                className="rounded-xl border border-amber-200/24 bg-amber-300/12 px-3 py-2 text-xs font-semibold text-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? 'Generating...' : currentDraftText.trim() ? 'Refresh draft' : 'Generate draft'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
