import type {
  AmbientAuditEventName,
  AmbientFlagCategory,
  AmbientListeningModuleConfig,
  AmbientSessionState,
} from '@/types/ambient-listening';

export const AMBIENT_LISTENING_CONFIG_KEY = 'clinical-documentation-transformer:ambient-listening-config';

export const DEFAULT_AMBIENT_LISTENING_MODULE_CONFIG: AmbientListeningModuleConfig = {
  tenantId: 'local-prototype',
  enabled: false,
  defaultProvider: 'mock-ambient',
  allowedProviders: ['mock-ambient'],
  requireConsentGate: true,
  requireVisibleRecordingIndicator: true,
  blockIfJurisdictionUnknown: true,
  requireEvidenceAnchors: true,
  allowRawAudioRetention: false,
  defaultRetentionPolicy: {
    policyId: 'ambient-default-no-audio',
    retainRawAudio: false,
    rawAudioTtlHours: null,
    transcriptRetention: 'until_note_finalized',
    transcriptTtlHours: null,
    evidenceSnippetRetention: 'accepted_assertions_only',
  },
  safety: {
    flagNegation: true,
    flagRiskLanguage: true,
    flagMedications: true,
    flagPsychosis: true,
    flagLegalStatus: true,
    flagUnsupportedClaims: true,
    flagProcessNoteBoundary: true,
    autoFinalize: false,
  },
};

export const AMBIENT_LISTENING_UI_STATES: AmbientSessionState[] = [
  'idle',
  'consent_pending',
  'ready_to_record',
  'recording',
  'paused',
  'off_record',
  'processing_transcript',
  'draft_generation_pending',
  'draft_ready',
  'needs_review',
  'accepted_into_note',
  'finalized',
  'discarded',
];

export const AMBIENT_LISTENING_FLAG_CATEGORIES: AmbientFlagCategory[] = [
  'consent',
  'speaker_attribution',
  'negation',
  'risk_language',
  'psychosis',
  'medication',
  'diagnosis',
  'legal_status',
  'unsupported_claim',
  'process_note_boundary',
  'stigma',
  'other',
];

export const AMBIENT_LISTENING_AUDIT_EVENT_NAMES: AmbientAuditEventName[] = [
  'ambient_session_created',
  'ambient_consent_granted',
  'ambient_consent_declined',
  'ambient_consent_withdrawn',
  'ambient_recording_started',
  'ambient_recording_paused',
  'ambient_recording_resumed',
  'ambient_recording_stopped',
  'ambient_transcript_turn_received',
  'ambient_draft_generated',
  'ambient_review_flag_opened',
  'ambient_note_section_accepted',
  'ambient_note_finalized',
  'ambient_retention_job_applied',
  'ambient_session_discarded',
];
