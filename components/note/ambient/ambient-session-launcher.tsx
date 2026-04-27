'use client';

import type { AmbientCareSetting, AmbientListeningMode } from '@/types/ambient-listening';
import type { AmbientSessionSetupDraft } from '@/lib/ambient-listening/mock-data';

const modeLabels: Record<AmbientListeningMode, string> = {
  ambient_in_room: 'In-room ambient',
  ambient_telehealth: 'Telehealth ambient',
  family_or_collateral: 'Collateral / family',
  group_session: 'Group session',
  uploaded_audio: 'Uploaded audio',
  simulation: 'Simulation',
};

const careSettingLabels: Record<AmbientCareSetting, string> = {
  outpatient_psychiatry: 'Outpatient psychiatry',
  outpatient_therapy: 'Outpatient therapy',
  inpatient: 'Inpatient',
  ed_crisis: 'ED / crisis',
  telehealth: 'Telehealth',
  other: 'Other',
};

const transcriptSimulatorLabels: Record<AmbientSessionSetupDraft['transcriptSimulator'], string> = {
  mock_seeded: 'Buffered mock queue',
  live_stream_adapter: 'Simulated live adapter',
};

const transcriptSimulatorDescriptions: Record<AmbientSessionSetupDraft['transcriptSimulator'], string> = {
  mock_seeded: 'Replays queued transcript events over polling so we can validate buffered delivery, post-stop flush, and attribution review.',
  live_stream_adapter: 'Pushes transcript events over SSE to mimic a live adapter stream while preserving the same psych-safe review workflow.',
};

export function AmbientSessionLauncher({
  enabled,
  draft,
  onChange,
  onStartSetup,
}: {
  enabled: boolean;
  draft: AmbientSessionSetupDraft;
  onChange: (draft: AmbientSessionSetupDraft) => void;
  onStartSetup: () => void;
}) {
  return (
    <section className="rounded-[24px] border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-900/72">Ambient launcher</div>
          <h3 className="mt-1 text-lg font-semibold text-amber-950">Start an internal ambient session shell</h3>
          <p className="mt-2 max-w-3xl text-sm text-amber-900">
            This mock launcher exists to validate the safer future workflow: consent first, speaker-aware transcript review, then evidence-linked draft acceptance.
          </p>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-950">
          Internal only
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-sm text-amber-900">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-amber-900/68">Ambient mode</span>
          <select
            value={draft.mode}
            onChange={(event) => onChange({ ...draft, mode: event.target.value as AmbientListeningMode })}
            className="w-full rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
          >
            {(Object.keys(modeLabels) as AmbientListeningMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {modeLabels[mode]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-amber-900">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-amber-900/68">Care setting</span>
          <select
            value={draft.careSetting}
            onChange={(event) => onChange({ ...draft, careSetting: event.target.value as AmbientCareSetting })}
            className="w-full rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
          >
            {(Object.keys(careSettingLabels) as AmbientCareSetting[]).map((setting) => (
              <option key={setting} value={setting}>
                {careSettingLabels[setting]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-amber-900">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-amber-900/68">Adapter simulator</span>
          <select
            value={draft.transcriptSimulator}
            onChange={(event) => onChange({
              ...draft,
              transcriptSimulator: event.target.value as AmbientSessionSetupDraft['transcriptSimulator'],
            })}
            className="w-full rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
          >
            {Object.entries(transcriptSimulatorLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-amber-900">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-amber-900/68">Provider state</span>
          <input
            value={draft.providerState || ''}
            onChange={(event) => onChange({ ...draft, providerState: event.target.value.toUpperCase().slice(0, 2) })}
            className="w-full rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
          />
        </label>

        <label className="text-sm text-amber-900">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-amber-900/68">Patient state</span>
          <input
            value={draft.patientState || ''}
            onChange={(event) => onChange({ ...draft, patientState: event.target.value.toUpperCase().slice(0, 2) })}
            className="w-full rounded-[16px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
          />
        </label>
      </div>

      <div className="mt-5 rounded-[18px] border border-amber-200 bg-amber-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-900/70">Participants</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {draft.participants.map((participant) => (
            <span key={participant.participantId} className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-950">
              {participant.displayLabel} • {participant.role.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-amber-900">
          Ambient alpha should not proceed without explicit participants and a consent workflow. Speaker differentiation depends on this setup being real, even in the mock shell.
        </p>
        <p className="mt-2 text-sm text-amber-900/82">
          Simulator path: {transcriptSimulatorLabels[draft.transcriptSimulator]}. This lets the internal shell test buffered mock replay versus a simulated live-adapter source without enabling microphone capture.
        </p>
        <div className="mt-3 rounded-[16px] border border-amber-200/80 bg-white/70 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/70">Expected behavior</div>
          <p className="mt-1 text-sm text-amber-900">
            {transcriptSimulatorDescriptions[draft.transcriptSimulator]}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-amber-900/72">
          Consent gate will still appear before recording. Draft-only acceptance remains mandatory.
        </div>
        <button
          type="button"
          onClick={onStartSetup}
          disabled={!enabled}
          className="rounded-[16px] bg-amber-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Open consent gate
        </button>
      </div>
    </section>
  );
}
