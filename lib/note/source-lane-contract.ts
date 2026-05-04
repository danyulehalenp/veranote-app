import type { SourceSections } from '@/types/session';
import {
  getOutputDestinationFieldTargets,
  getOutputDestinationMeta,
  type OutputDestination,
  type OutputFieldTarget,
  type OutputNoteFocus,
} from '@/lib/veranote/output-destinations';

export const SOURCE_LANE_ORDER = [
  'intakeCollateral',
  'clinicianNotes',
  'patientTranscript',
  'objectiveData',
] as const;

export type SourceLaneId = (typeof SOURCE_LANE_ORDER)[number];

export type SourceLaneContract = {
  id: SourceLaneId;
  label: string;
  shortLabel: string;
  populatedLabel: string;
  providerPurpose: string;
  generationRole: string;
  acceptsDictation: boolean;
  defaultAmbientTarget: boolean;
  acceptsUploads: boolean;
  clinicalReliability: 'source-material' | 'provider-observation' | 'transcript-requires-review' | 'instructional-only';
  finalNoteRule: string;
  futureEhrUse: string;
};

export type EhrOutputReadiness = {
  destination: OutputDestination;
  noteFocus: OutputNoteFocus;
  currentMode: 'copy_paste_export';
  directWritebackSupported: false;
  connectorPhase: 'future_connector_required';
  summaryLabel: string;
  wholeNoteCopySupported: boolean;
  fieldLevelCopySupported: boolean;
  fieldTargets: OutputFieldTarget[];
  guardrails: string[];
};

export const SOURCE_LANE_CONTRACTS: SourceLaneContract[] = [
  {
    id: 'intakeCollateral',
    label: 'Pre-Visit Data',
    shortLabel: 'Pre-visit',
    populatedLabel: 'Pre-visit data',
    providerPurpose: 'Labs, vitals, nursing intake, referrals, prior notes, copied EHR text, and reviewed document/OCR summaries gathered before seeing the patient.',
    generationRole: 'Use as source material that may be historical, collateral, objective, or copied from another system. Preserve attribution and uncertainty.',
    acceptsDictation: true,
    defaultAmbientTarget: false,
    acceptsUploads: true,
    clinicalReliability: 'source-material',
    finalNoteRule: 'Can become clinical note content only when source-attributed and clinically supported.',
    futureEhrUse: 'Maps naturally to HPI/history, labs, medication list, collateral, and objective data paste targets in destination EHRs.',
  },
  {
    id: 'clinicianNotes',
    label: 'Live Visit Notes',
    shortLabel: 'Live notes',
    populatedLabel: 'Live visit notes',
    providerPurpose: 'Provider typed or dictated observations, interval history, MSE notes, risk updates, plan details, and session notes captured during the encounter.',
    generationRole: 'Treat as provider-authored encounter source, while still preserving uncertainty and avoiding invented findings.',
    acceptsDictation: true,
    defaultAmbientTarget: false,
    acceptsUploads: false,
    clinicalReliability: 'provider-observation',
    finalNoteRule: 'May drive final note wording when the source is specific enough; sparse notes should stay sparse.',
    futureEhrUse: 'Maps naturally to HPI/subjective, MSE/objective, assessment, and plan paste targets.',
  },
  {
    id: 'patientTranscript',
    label: 'Ambient Transcript',
    shortLabel: 'Ambient',
    populatedLabel: 'Ambient transcript',
    providerPurpose: 'Reviewed ambient listening transcript or ambient summary that the provider can correct before note generation.',
    generationRole: 'Use as transcript-derived source. Do not treat as more reliable than provider notes, collateral, objective data, or reviewed documents.',
    acceptsDictation: true,
    defaultAmbientTarget: true,
    acceptsUploads: false,
    clinicalReliability: 'transcript-requires-review',
    finalNoteRule: 'Can support patient quotes and session narrative after provider review; preserve speaker/source conflicts.',
    futureEhrUse: 'Maps to narrative, subjective, therapy process, and source quote targets after review.',
  },
  {
    id: 'objectiveData',
    label: 'Provider Add-On',
    shortLabel: 'Add-on',
    populatedLabel: 'Provider add-on',
    providerPurpose: 'Provider instructions, named prompts, billing/code preferences, diagnosis preferences, destination formatting needs, and plan clarifications that do not fit elsewhere.',
    generationRole: 'Use as drafting instructions and provider preferences, not as patient-reported history or completed clinical action unless explicitly documented as source.',
    acceptsDictation: true,
    defaultAmbientTarget: false,
    acceptsUploads: false,
    clinicalReliability: 'instructional-only',
    finalNoteRule: 'Do not echo raw prompt names, CPT preferences, internal instructions, or “do not” rules inside the clinical note.',
    futureEhrUse: 'Maps to destination behavior and section-output rules, not to patient chart facts.',
  },
];

export const FUTURE_EHR_WRITEBACK_CONTRACT = {
  status: 'future_design_constraint',
  currentMode: 'copy_paste_export_only',
  notImplementedYet: true,
  principles: [
    'Final notes must remain section-addressable so future EHR connectors can target specific fields.',
    'Direct EHR writeback must be explicit, provider-confirmed, connector-specific, auditable, and reversible where the target EHR allows it.',
    'Copy/paste export remains the safe default until a destination-specific connector is implemented and validated.',
    'No workflow should imply certified EHR integration merely because a destination formatting profile exists.',
  ],
  notAllowedNow: [
    'Silent auto-insertion into an external EHR.',
    'Claims that Veranote is directly integrated with a destination EHR without a verified connector.',
    'Changing clinical meaning to fit an EHR template.',
    'Dropping source conflicts, risk caveats, or uncertainty to make a destination field look cleaner.',
  ],
} as const;

export function getSourceLaneContract(id: SourceLaneId) {
  return SOURCE_LANE_CONTRACTS.find((lane) => lane.id === id) || null;
}

export function normalizeSourceLaneText(sections: SourceSections, id: SourceLaneId) {
  return typeof sections[id] === 'string' ? sections[id].trim() : '';
}

export function buildEhrOutputReadiness(
  destination: OutputDestination,
  noteFocus: OutputNoteFocus = 'general',
): EhrOutputReadiness {
  const meta = getOutputDestinationMeta(destination);
  const fieldTargets = getOutputDestinationFieldTargets(destination, noteFocus);

  return {
    destination,
    noteFocus,
    currentMode: 'copy_paste_export',
    directWritebackSupported: false,
    connectorPhase: 'future_connector_required',
    summaryLabel: meta.summaryLabel,
    wholeNoteCopySupported: true,
    fieldLevelCopySupported: fieldTargets.length > 0,
    fieldTargets,
    guardrails: [
      meta.pasteExpectation,
      'Preserve clinical meaning, source attribution, risk wording, and uncertainty before destination formatting.',
      'Use field-level copy targets when the destination EHR splits notes into separate paste areas.',
      'Treat direct EHR writeback as future connector work, not current product behavior.',
    ],
  };
}

export function getSourceLaneLabelsInOrder() {
  return SOURCE_LANE_ORDER.map((id) => getSourceLaneContract(id)?.label || id);
}
