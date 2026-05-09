import type { NoteSectionKey, OutputScope } from '@/lib/note/section-profiles';
import type { DictationTargetSection, TranscriptReviewFlag } from '@/types/dictation';

export interface NoteClaim {
    claim_id: string;
    claim_text: string;
    section: SectionType;
    source_refs: SourceReference[];
    evidence_status: EvidenceStatus;
    review_required: boolean;
    rationale?: string;
}

export interface SourceReference {
    span_id: string;
    source_type: SourceType;
    text_excerpt?: string;
}

export type EvidenceStatus =
    | "supported"
    | "inferred"
    | "contradicted"
    | "missing";

export type SourceType =
    | "transcript"
    | "intake"
    | "collateral"
    | "structured_data"
    | "medication_list"
    | "lab_result";

export type SectionType =
    | "hpi"
    | "mse"
    | "medications"
    | "assessment"
    | "plan"
    | "ros"
    | "collateral"
    | "safety";

export function validateClaim(claim: NoteClaim): string[] {
    const errors: string[] = [];

    if (claim.evidence_status === "supported" && claim.source_refs.length === 0) {
        errors.push("Supported claims must have source_refs.");
    }

    if (
        (claim.evidence_status === "inferred" || claim.evidence_status === "contradicted") &&
        !claim.rationale
    ) {
        errors.push("Inferred and contradicted claims must provide a rationale.");
    }

    if (claim.evidence_status !== "supported" && !claim.review_required) {
        errors.push("Non-supported claims must require review.");
    }

    return errors;
}
export interface DraftSession {
  draftId?: string;
  draftVersion?: number;
  providerIdentityId?: string;
  lastSavedAt?: string;
  specialty: string;
  role: string;
  noteType: string;
  template: string;
  outputStyle: string;
  format: string;
  keepCloserToSource: boolean;
  flagMissingInfo: boolean;
  outputScope?: OutputScope;
  requestedSections?: NoteSectionKey[];
  selectedPresetId?: string;
  presetName?: string;
  customInstructions?: string;
  encounterSupport?: EncounterSupport;
  medicationProfile?: StructuredPsychMedicationProfileEntry[];
  diagnosisProfile?: StructuredPsychDiagnosisProfileEntry[];
  sourceInput: string;
  sourceSections?: unknown;
  ambientTranscriptHandoff?: AmbientTranscriptHandoff;
  dictationInsertions?: Partial<Record<DictationTargetSection, DictationInsertionRecord[]>>;
  note: string;
  draftRevisions?: DraftRevision[];
  flags: string[];
  copilotSuggestions: CopilotSuggestion[];
  sectionReviewState?: SectionReviewState;
  sourceFidelityReviewState?: SourceFidelityReviewState;
  recoveryState?: DraftRecoveryState;
  mode: "live" | "fallback";
  warning?: string;
}

export interface DraftRevision {
  id: string;
  label: string;
  source: 'assistant-rewrite' | 'review-rewrite' | 'manual-restore' | 'focused-revision';
  note: string;
  createdAt: string;
  wordCount?: number;
}

export type DraftWorkflowStage = 'compose' | 'review';

export type DraftComposeLane = 'setup' | 'source' | 'support' | 'finish';

export interface DraftRecoveryState {
  workflowStage: DraftWorkflowStage;
  composeLane: DraftComposeLane;
  recommendedStage: DraftWorkflowStage;
  updatedAt: string;
  lastOpenedAt?: string;
}

export interface PersistedDraftSession extends DraftSession {
  id: string;
  providerIdentityId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  archivedAt?: string;
  lastOpenedAt?: string;
}

export interface SourceSection {
  label?: string;
  content: string;
}

export type TelehealthModality = 'audio-video' | 'audio-only' | 'in-person' | 'not-applicable';

export type EncounterSupport = {
  serviceDate?: string;
  totalMinutes?: string;
  psychotherapyMinutes?: string;
  sessionStartTime?: string;
  sessionEndTime?: string;
  telehealthModality?: TelehealthModality;
  telehealthConsent?: boolean;
  patientLocation?: string;
  providerLocation?: string;
  emergencyContact?: string;
  interactiveComplexity?: boolean;
  interactiveComplexityReason?: string;
  crisisStartTime?: string;
  crisisEndTime?: string;
  crisisInterventionSummary?: string;
};

export type StructuredPsychMedicationProfileEntry = {
  id: string;
  rawName: string;
  normalizedMedicationId?: string;
  normalizedDisplayName?: string;
  doseText?: string;
  scheduleText?: string;
  route?: string;
  status?: 'current' | 'recently-stopped' | 'prn' | 'unclear';
  adherenceNote?: string;
  sideEffectNote?: string;
  clinicianComment?: string;
};

export type StructuredPsychDiagnosisProfileEntry = {
  id: string;
  rawLabel: string;
  familyFocus?: string;
  normalizedDiagnosisId?: string;
  normalizedDisplayName?: string;
  category?: string;
  status?: 'current-working' | 'historical' | 'rule-out' | 'differential' | 'symptom-level';
  certainty?: 'high' | 'moderate' | 'low' | 'unclear';
  timeframeNote?: string;
  evidenceNote?: string;
  clinicianComment?: string;
};

export type SourceSections = Record<string, string>;

export interface AmbientTranscriptHandoff {
  sourceSection: 'patientTranscript';
  sourceMode: 'ambient_transcript';
  committedAt: string;
  sessionState: string;
  transcriptEventCount: number;
  reviewFlagCount: number;
  unresolvedSpeakerTurnCount: number;
  transcriptReadyForSource: boolean;
}

export interface DictationInsertionRecord {
  segmentId: string;
  dictationSessionId: string;
  targetSection: DictationTargetSection;
  text: string;
  insertedAt: string;
  transactionId: string;
  provider: string;
  sourceMode: string;
  confidence?: number;
  reviewFlags: TranscriptReviewFlag[];
  destinationMode?: 'floating-source-box' | 'floating-field-box';
  destinationFieldId?: string;
  destinationFieldLabel?: string;
}

export interface SectionReviewEntry {
  heading: string;
  status: ReviewStatus;
  updatedAt?: string;
  confirmedEvidenceBlockIds: string[];
  reviewerComment?: string;
}

export type SectionReviewState = Record<string, SectionReviewEntry>;

export type SourceFidelityReviewStatus = "open" | "reviewed" | "needs-revision" | "dismissed";

export interface SourceFidelityReviewEntry {
  id: string;
  status: SourceFidelityReviewStatus;
  updatedAt?: string;
  reviewerComment?: string;
}

export type SourceFidelityReviewState = Record<string, SourceFidelityReviewEntry>;

export type CopilotSuggestionSeverity = "info" | "review" | "warning";

export interface CopilotSuggestion {
  severity: CopilotSuggestionSeverity;
  title: string;
  detail?: string;
  summary?: string;
  recommendation?: string;
  basedOn?: string[];
  [key: string]: unknown;
}

export type ReviewStatus = "unreviewed" | "approved" | "needs-review";
