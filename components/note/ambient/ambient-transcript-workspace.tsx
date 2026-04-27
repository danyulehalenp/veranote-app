'use client';

import type { AmbientParticipant, AmbientParticipantRole } from '@/types/ambient-listening';
import type { AmbientTranscriptTurnViewModel } from '@/lib/ambient-listening/mock-data';

function roleTone(role: AmbientParticipantRole) {
  switch (role) {
    case 'provider':
      return 'border-cyan-200 bg-cyan-50 text-cyan-950';
    case 'patient':
      return 'border-emerald-200 bg-emerald-50 text-emerald-950';
    case 'family_member':
    case 'guardian':
    case 'caregiver':
      return 'border-violet-200 bg-violet-50 text-violet-950';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-900';
  }
}

export function AmbientTranscriptWorkspace({
  turns,
  participants,
  selectedTurnId,
  onSelectTurn,
  onRelabelSpeaker,
  onExcludeTurn,
  onRestoreTurn,
  onMarkProviderConfirmed,
  onOpenSpeakerCorrection,
}: {
  turns: AmbientTranscriptTurnViewModel[];
  participants: AmbientParticipant[];
  selectedTurnId?: string;
  onSelectTurn: (turnId: string) => void;
  onRelabelSpeaker: (turnId: string, role: AmbientParticipantRole) => void;
  onExcludeTurn: (turnId: string) => void;
  onRestoreTurn: (turnId: string) => void;
  onMarkProviderConfirmed: (turnId: string) => void;
  onOpenSpeakerCorrection: (turnId: string) => void;
}) {
  const participantRoles = participants.map((participant) => participant.role);

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Diarized transcript</div>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Review who said what before trusting the draft</h3>
          <p className="mt-2 text-sm text-slate-600">
            This transcript shell treats speaker attribution as a first-class safety signal. Low-confidence turns are visible and correctable before note acceptance.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {participantRoles.map((role, index) => (
            <span key={`${role}-${index}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${roleTone(role)}`}>
              {role.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {turns.map((turn) => (
          <div
            key={turn.id}
            className={`rounded-[18px] border p-4 ${selectedTurnId === turn.id ? 'border-cyan-300 bg-cyan-50/60' : 'border-slate-200 bg-slate-50/70'} ${turn.excludedFromDraft ? 'opacity-60' : ''}`}
          >
            <button type="button" className="block w-full text-left" onClick={() => onSelectTurn(turn.id)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${roleTone(turn.speakerRole)}`}>
                  {turn.speakerRole.replace(/_/g, ' ')}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                  {turn.speakerLabel || 'No label'} • {Math.round(turn.speakerConfidence * 100)}%
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                  Text {Math.round(turn.textConfidence * 100)}%
                </span>
                {turn.severityBadges.map((badge) => (
                  <span key={`${turn.id}-${badge}`} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-950">
                    {badge}
                  </span>
                ))}
                {turn.providerConfirmed ? (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-950">
                    provider confirmed
                  </span>
                ) : null}
                {turn.excludedFromDraft ? (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-950">
                    excluded from draft
                  </span>
                ) : null}
              </div>

              <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-900">{turn.text}</div>

              <div className="mt-2 text-xs text-slate-500">
                {Math.round(turn.startMs / 1000)}s - {Math.round(turn.endMs / 1000)}s
                {turn.linkedDraftSentenceIds.length ? ` • linked to ${turn.linkedDraftSentenceIds.length} draft sentence${turn.linkedDraftSentenceIds.length === 1 ? '' : 's'}` : ''}
              </div>
            </button>

            <div className="mt-4 flex flex-wrap gap-2">
              <select
                value={turn.speakerRole}
                onChange={(event) => onRelabelSpeaker(turn.id, event.target.value as AmbientParticipantRole)}
                className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {participants.map((participant) => (
                  <option key={`${turn.id}-${participant.participantId}`} value={participant.role}>
                    {participant.displayLabel} • {participant.role.replace(/_/g, ' ')}
                  </option>
                ))}
                <option value="unknown">Unknown</option>
              </select>

              <button
                type="button"
                onClick={() => onOpenSpeakerCorrection(turn.id)}
                className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              >
                Correct speaker
              </button>
              <button
                type="button"
                onClick={() => onMarkProviderConfirmed(turn.id)}
                className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950"
              >
                Provider confirm
              </button>
              <button
                type="button"
                onClick={() => (turn.excludedFromDraft ? onRestoreTurn(turn.id) : onExcludeTurn(turn.id))}
                className="rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950"
              >
                {turn.excludedFromDraft ? 'Restore turn' : 'Exclude from draft'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
