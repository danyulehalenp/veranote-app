'use client';

import type { AmbientParticipant } from '@/types/ambient-listening';
import type { AmbientConsentEventDraft } from '@/lib/ambient-listening/mock-data';

export function AmbientConsentGateSheet({
  open,
  participants,
  consentDrafts,
  onChangeDraft,
  onConfirmReady,
  onCancel,
}: {
  open: boolean;
  participants: AmbientParticipant[];
  consentDrafts: AmbientConsentEventDraft[];
  onChangeDraft: (participantId: string, patch: Partial<AmbientConsentEventDraft>) => void;
  onConfirmReady: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  const allGranted = consentDrafts.every((draft) => draft.status === 'granted');

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="flex max-h-[min(88vh,920px)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-amber-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
        <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-900/72">Consent gate</div>
            <h3 className="mt-1 text-xl font-semibold text-amber-950">Confirm recording, transcription, and AI-draft consent</h3>
            <p className="mt-2 text-sm text-amber-900">
              Ambient capture stays blocked until required participants have explicit consent recorded. This mock sheet is here to validate the workflow, not bypass it.
            </p>
          </div>
          <div className={`rounded-full border px-3 py-1 text-xs font-medium ${allGranted ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
            {allGranted ? 'Consent ready' : 'Consent incomplete'}
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          {participants.map((participant) => {
            const draft = consentDrafts.find((item) => item.participantId === participant.participantId);

            return (
              <div key={participant.participantId} className="rounded-[18px] border border-amber-200 bg-amber-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-amber-950">{participant.displayLabel}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.12em] text-amber-900/68">
                      {participant.role.replace(/_/g, ' ')} {participant.speakerLabel ? `• ${participant.speakerLabel}` : ''}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-xs text-amber-900">
                      <span className="mb-1 block font-semibold uppercase tracking-[0.12em] text-amber-900/68">Status</span>
                      <select
                        value={draft?.status || 'granted'}
                        onChange={(event) => onChangeDraft(participant.participantId, { status: event.target.value as AmbientConsentEventDraft['status'] })}
                        className="rounded-[14px] border border-amber-200 bg-white px-3 py-2 text-sm text-amber-950"
                      >
                        <option value="granted">Granted</option>
                        <option value="declined">Declined</option>
                        <option value="withdrawn">Withdrawn</option>
                      </select>
                    </label>

                    <label className="text-xs text-amber-900">
                      <span className="mb-1 block font-semibold uppercase tracking-[0.12em] text-amber-900/68">Method</span>
                      <select
                        value={draft?.method || 'verbal'}
                        onChange={(event) => onChangeDraft(participant.participantId, { method: event.target.value as AmbientConsentEventDraft['method'] })}
                        className="rounded-[14px] border border-amber-200 bg-white px-3 py-2 text-sm text-amber-950"
                      >
                        <option value="verbal">Verbal</option>
                        <option value="written">Written</option>
                        <option value="portal_pre_authorized">Portal pre-authorized</option>
                        <option value="implied_by_policy">Implied by policy</option>
                        <option value="not_applicable">Not applicable</option>
                      </select>
                    </label>

                    <label className="text-xs text-amber-900">
                      <span className="mb-1 block font-semibold uppercase tracking-[0.12em] text-amber-900/68">Notes</span>
                      <input
                        value={draft?.notes || ''}
                        onChange={(event) => onChangeDraft(participant.participantId, { notes: event.target.value })}
                        className="rounded-[14px] border border-amber-200 bg-white px-3 py-2 text-sm text-amber-950"
                      />
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Ambient recording remains draft-only, evidence-linked, and provider-reviewed. This shell is intentionally strict because that is the only way the feature will be trustworthy later.
        </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            data-testid="ambient-consent-cancel"
            className="rounded-[16px] border border-amber-200 bg-white px-4 py-2.5 text-sm font-medium text-amber-950"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirmReady}
            disabled={!allGranted}
            data-testid="ambient-consent-confirm"
            className="rounded-[16px] bg-amber-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm consent and continue
          </button>
        </div>
      </div>
    </div>
  );
}
