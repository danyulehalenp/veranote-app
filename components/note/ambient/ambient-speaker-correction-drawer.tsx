'use client';

import type { AmbientParticipant, AmbientParticipantRole } from '@/types/ambient-listening';
import type { AmbientTranscriptTurnViewModel } from '@/lib/ambient-listening/mock-data';

export function AmbientSpeakerCorrectionDrawer({
  open,
  turn,
  participantOptions,
  onAssignRole,
  onAssignSpeakerLabel,
  onMarkUnresolved,
  onClose,
}: {
  open: boolean;
  turn: AmbientTranscriptTurnViewModel | null;
  participantOptions: AmbientParticipant[];
  onAssignRole: (turnId: string, role: AmbientParticipantRole) => void;
  onAssignSpeakerLabel: (turnId: string, speakerLabel: string | null) => void;
  onMarkUnresolved: (turnId: string) => void;
  onClose: () => void;
}) {
  if (!open || !turn) {
    return null;
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-slate-200 bg-white shadow-[-24px_0_48px_rgba(15,23,42,0.18)]">
      <div className="flex h-full flex-col">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Speaker correction</div>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">Resolve attribution before note acceptance</h3>
            </div>
            <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-700">
              Close
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Selected turn</div>
            <div className="mt-2 text-sm leading-6 text-slate-900">{turn.text}</div>
            <div className="mt-3 text-xs text-slate-500">
              Current role: {turn.speakerRole.replace(/_/g, ' ')} • {turn.speakerLabel || 'No speaker label'} • {Math.round(turn.speakerConfidence * 100)}% confidence
            </div>
          </div>

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Assign role</span>
            <select
              value={turn.speakerRole}
              onChange={(event) => onAssignRole(turn.id, event.target.value as AmbientParticipantRole)}
              className="w-full rounded-[16px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
            >
              {participantOptions.map((participant) => (
                <option key={participant.participantId} value={participant.role}>
                  {participant.displayLabel} • {participant.role.replace(/_/g, ' ')}
                </option>
              ))}
              <option value="unknown">Unknown</option>
            </select>
          </label>

          <label className="block text-sm text-slate-700">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Speaker label</span>
            <input
              value={turn.speakerLabel || ''}
              onChange={(event) => onAssignSpeakerLabel(turn.id, event.target.value || null)}
              className="w-full rounded-[16px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
            />
          </label>

          <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            If the role is still uncertain, keep it unresolved rather than drafting confident psychiatric language from the wrong speaker.
          </div>
        </div>

        <div className="border-t border-slate-200 p-5">
          <div className="flex flex-wrap justify-between gap-3">
            <button
              type="button"
              onClick={() => onMarkUnresolved(turn.id)}
              className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-950"
            >
              Mark unresolved
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[16px] bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
