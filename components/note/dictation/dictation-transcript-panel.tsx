'use client';

import { resolveDictationCommandMatch } from '@/lib/dictation/command-library';
import type { DictationAuditEvent, TranscriptSegment } from '@/types/dictation';

function formatLedgerEventLabel(eventName: DictationAuditEvent['eventName']) {
  return eventName.replace(/^dictation_/, '').replace(/_/g, ' ');
}

type DictationSessionHistoryItem = {
  sessionId: string;
  lastOccurredAt: string;
  providerLabel: string;
  eventCount: number;
  eventNames: string[];
};

export function DictationTranscriptPanel({
  enabled,
  captureLabel,
  providerLabel,
  providerNote,
  transportLabel,
  auditEvents,
  sessionHistory = [],
  selectedSessionId,
  selectedSessionEvents,
  selectedSessionLoading,
  queuedTranscriptEventCount,
  uploadedChunkCount,
  uploadedAudioBytes,
  interimText,
  mockDraft,
  onMockDraftChange,
  onQueueMockUtterance,
  pendingSegments,
  insertedSegments,
  commandLibrary,
  onAcceptSegment,
  onDiscardSegment,
  onSelectSessionHistory,
}: {
  enabled: boolean;
  captureLabel: string;
  providerLabel: string;
  providerNote: string;
  transportLabel: string;
  auditEvents: DictationAuditEvent[];
  sessionHistory?: DictationSessionHistoryItem[];
  selectedSessionId?: string;
  selectedSessionEvents?: DictationAuditEvent[];
  selectedSessionLoading?: boolean;
  queuedTranscriptEventCount: number;
  uploadedChunkCount: number;
  uploadedAudioBytes: number;
  interimText?: string;
  mockDraft: string;
  onMockDraftChange: (value: string) => void;
  onQueueMockUtterance: () => void;
  pendingSegments: TranscriptSegment[];
  insertedSegments: TranscriptSegment[];
  commandLibrary: Parameters<typeof resolveDictationCommandMatch>[1];
  onAcceptSegment: (segmentId: string) => void;
  onDiscardSegment: (segmentId: string) => void;
  onSelectSessionHistory: (sessionId: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="workspace-subpanel rounded-[22px] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/64">Transcript feed</div>
            <div className="mt-1 text-sm font-semibold text-white">Review spoken source first, then insert only what belongs in note input</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-medium text-cyan-50/74">
              Review-first
            </span>
            <span className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[11px] font-medium text-cyan-50/74">
              {captureLabel}
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[14px] border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/60">Provider</div>
            <div className="mt-1 text-sm font-medium text-cyan-50/82">{providerLabel}</div>
            <div className="mt-1 text-xs text-cyan-50/62">{providerNote}</div>
          </div>
          <div className="rounded-[14px] border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/60">Transport</div>
            <div className="mt-1 text-sm font-medium text-cyan-50/82">{transportLabel}</div>
            <div className="mt-1 text-xs text-cyan-50/62">{queuedTranscriptEventCount} queued event{queuedTranscriptEventCount === 1 ? '' : 's'}</div>
          </div>
          <div className="rounded-[14px] border border-white/10 bg-white/5 px-3 py-2 sm:col-span-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/60">Backend intake</div>
            <div className="mt-1 text-sm font-medium text-cyan-50/82">
              {uploadedChunkCount} audio chunk{uploadedChunkCount === 1 ? '' : 's'} • {uploadedAudioBytes} bytes
            </div>
          </div>
        </div>
        <details className="mt-4 rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
          <summary className="cursor-pointer text-sm font-medium text-cyan-50/82">Test phrase composer</summary>
          <div className="mt-3 text-xs text-cyan-50/66">
            Use this only for internal validation when you want to simulate transcript output without live audio.
          </div>
          <textarea
            value={mockDraft}
            onChange={(event) => onMockDraftChange(event.target.value)}
            placeholder="Type a test phrase here when you want to simulate transcript output without live audio."
            className="workspace-control mt-3 min-h-[120px] w-full rounded-[18px] px-4 py-3 text-sm leading-6"
          />
          <button
            type="button"
            onClick={onQueueMockUtterance}
            disabled={!enabled || !mockDraft.trim()}
            className="mt-3 rounded-xl bg-[rgba(56,189,248,0.16)] px-3 py-2 text-sm font-medium text-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Queue test phrase
          </button>
        </details>
        <div className="mt-4 rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/62">Interim preview</div>
          <div className="mt-2 whitespace-pre-wrap text-sm text-cyan-50/78">
            {interimText?.trim() || 'Interim dictation text will appear here before review.'}
          </div>
        </div>
        <details className="mt-4 rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
          <summary className="cursor-pointer text-sm font-medium text-cyan-50/82">Recent ledger</summary>
          <div className="mt-1 text-xs text-cyan-50/68">Saved session history for this dictation thread.</div>
          <div className="mt-3 space-y-2">
            {auditEvents.length ? auditEvents.slice(0, 5).map((event) => (
              <div key={event.id} className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-cyan-50/64">
                  <span className="font-medium text-cyan-50/78">{formatLedgerEventLabel(event.eventName)}</span>
                  <span>{new Date(event.occurredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
                </div>
                <div className="mt-1 text-xs text-cyan-50/68">
                  {event.eventDomain} • {event.sttProvider || 'local'}
                </div>
                <div className="mt-2 text-sm text-cyan-50/78">
                  {Object.entries(event.payload).slice(0, 2).map(([key, value]) => `${key}: ${String(value)}`).join(' • ') || 'No extra detail'}
                </div>
              </div>
            )) : (
              <div className="rounded-[14px] border border-white/10 bg-white/5 p-3 text-sm text-cyan-50/72">
                No recent dictation events yet.
              </div>
            )}
          </div>
        </details>
        <details className="mt-4 rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3" open={Boolean(selectedSessionId)}>
          <summary className="cursor-pointer text-sm font-medium text-cyan-50/82">Saved sessions</summary>
          <div className="mt-1 text-xs text-cyan-50/68">Recent dictation runs for this provider, even after the active session changes.</div>
          <div className="mt-3 space-y-2">
            {sessionHistory.length ? sessionHistory.map((item) => (
              <button
                key={item.sessionId}
                type="button"
                onClick={() => onSelectSessionHistory(item.sessionId)}
                className={`block w-full rounded-[14px] border p-3 text-left ${selectedSessionId === item.sessionId ? 'border-cyan-300/28 bg-[rgba(56,189,248,0.12)]' : 'border-white/10 bg-white/5'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-cyan-50/64">
                  <span className="font-medium text-cyan-50/78">{item.providerLabel}</span>
                  <span>{new Date(item.lastOccurredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                <div className="mt-1 text-xs text-cyan-50/68">
                  {item.sessionId} • {item.eventCount} event{item.eventCount === 1 ? '' : 's'}
                </div>
                <div className="mt-2 text-sm text-cyan-50/78">
                  {item.eventNames.join(' • ')}
                </div>
              </button>
            )) : (
              <div className="rounded-[14px] border border-white/10 bg-white/5 p-3 text-sm text-cyan-50/72">
                No saved dictation sessions yet.
              </div>
            )}
          </div>
        </details>
        <details className="mt-4 rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3" open={Boolean(selectedSessionEvents?.length)}>
          <summary className="cursor-pointer text-sm font-medium text-cyan-50/82">Session detail</summary>
          <div className="mt-1 text-xs text-cyan-50/68">Inspect the full saved event trail for a selected dictation run.</div>
          <div className="mt-3 space-y-2">
            {selectedSessionLoading ? (
              <div className="rounded-[14px] border border-white/10 bg-white/5 p-3 text-sm text-cyan-50/72">
                Loading saved session history...
              </div>
            ) : selectedSessionEvents?.length ? selectedSessionEvents.map((event) => (
              <div key={`detail-${event.id}`} className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-cyan-50/64">
                  <span className="font-medium text-cyan-50/78">{formatLedgerEventLabel(event.eventName)}</span>
                  <span>{new Date(event.occurredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>
                </div>
                <div className="mt-1 text-xs text-cyan-50/68">
                  {event.eventDomain} • {event.sttProvider || 'local'} • {event.dictationSessionId}
                </div>
                <div className="mt-2 text-sm text-cyan-50/78">
                  {Object.entries(event.payload).map(([key, value]) => `${key}: ${String(value)}`).join(' • ') || 'No extra detail'}
                </div>
              </div>
            )) : (
              <div className="rounded-[14px] border border-white/10 bg-white/5 p-3 text-sm text-cyan-50/72">
                Select a saved session to inspect its full event trail.
              </div>
            )}
          </div>
        </details>
      </section>

      <section className="workspace-subpanel rounded-[22px] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/64">Transcript review queue</div>
            <div className="mt-1 text-sm font-semibold text-white">Accept only what should become source material</div>
          </div>
          <div className="flex gap-2 text-xs text-cyan-50/72">
            <span>{pendingSegments.length} pending</span>
            <span>{insertedSegments.length} inserted</span>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {pendingSegments.length ? pendingSegments.map((segment) => (
            <div key={segment.id} className="rounded-[18px] border border-amber-300/20 bg-[rgba(245,158,11,0.08)] p-3">
              {(() => {
                const commandMatch = resolveDictationCommandMatch(segment.text, commandLibrary);
                return (
                  <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[11px] font-medium text-cyan-50/74">
                  final segment
                </span>
                {commandMatch ? (
                  <span className="rounded-full border border-sky-300/18 bg-[rgba(56,189,248,0.12)] px-2.5 py-1 text-[11px] font-medium text-sky-50">
                    stored command: {commandMatch.label}
                  </span>
                ) : null}
                {segment.reviewFlags.map((flag) => (
                  <span key={`${segment.id}-${flag.flagType}`} className="rounded-full border border-rose-300/18 bg-[rgba(244,63,94,0.12)] px-2.5 py-1 text-[11px] font-medium text-rose-50">
                    {flag.flagType.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-white">{segment.text}</div>
              {commandMatch?.outputText ? (
                <div className="mt-2 rounded-[14px] border border-sky-300/16 bg-[rgba(56,189,248,0.08)] p-3 text-sm text-cyan-50/80">
                  Applying this command will insert template text instead of the spoken phrase.
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onAcceptSegment(segment.id)}
                  className="rounded-xl bg-[rgba(34,197,94,0.18)] px-3 py-2 text-sm font-medium text-emerald-50"
                >
                  {commandMatch?.outputText ? 'Apply command' : 'Insert into source'}
                </button>
                <button
                  type="button"
                  onClick={() => onDiscardSegment(segment.id)}
                  className="rounded-xl bg-[rgba(255,255,255,0.08)] px-3 py-2 text-sm font-medium text-cyan-50/80"
                >
                  Discard
                </button>
              </div>
                  </>
                );
              })()}
            </div>
          )) : (
            <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 text-sm text-cyan-50/72">
              No final segments are waiting for review.
            </div>
          )}
        </div>

        {insertedSegments.length ? (
          <div className="mt-4 rounded-[18px] border border-emerald-300/16 bg-[rgba(16,185,129,0.08)] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/76">Recently inserted</div>
            <div className="mt-3 space-y-2">
              {insertedSegments.slice(0, 3).map((segment) => (
                <div key={`inserted-${segment.id}`} className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                  <div className="text-xs text-emerald-50/74">
                    {segment.targetSection || 'source'} {segment.insertedTransactionId ? `• ${segment.insertedTransactionId}` : ''}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-white">{segment.text}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
