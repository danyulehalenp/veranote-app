import type {
  DictationEventName,
  DictationModuleConfig,
  DictationReviewFlagType,
  DictationUiState,
} from '@/types/dictation';

export const DICTATION_CONFIG_KEY = 'clinical-documentation-transformer:dictation-config';

export const DEFAULT_DICTATION_MODULE_CONFIG: DictationModuleConfig = {
  tenantId: 'local-prototype',
  enabled: false,
  defaultSttProvider: 'mock-stt',
  allowedSttProviders: ['mock-stt'],
  enableWebSpeechDevOnly: false,
  retention: {
    storeAudio: false,
    audioRetentionDays: 0,
    storeInterimTranscripts: false,
    finalTranscriptRetention: 'same_as_note',
  },
  safety: {
    flagNegation: true,
    flagRiskLanguage: true,
    flagMedications: true,
    flagLegalStatus: true,
    autoRewrite: false,
  },
  editor: {
    commitMode: 'manual_accept',
    dictationBoxFallback: true,
    provenanceMarkers: true,
  },
};

export const DICTATION_UI_STATES: DictationUiState[] = [
  'idle',
  'permission_needed',
  'starting',
  'listening',
  'paused',
  'interim',
  'final_ready',
  'committed',
  'error',
  'stopped',
];

export const DICTATION_HIGH_RISK_FLAG_TYPES: DictationReviewFlagType[] = [
  'negation',
  'risk_language',
  'medication',
  'dose',
  'allergy',
  'legal_status',
  'diagnosis',
  'mse_inference',
  'stigma',
];

export const DICTATION_AUDIT_EVENT_NAMES: DictationEventName[] = [
  'dictation_session_started',
  'dictation_draft_resumed',
  'dictation_permission_denied',
  'dictation_audio_stream_started',
  'dictation_interim_segment',
  'dictation_final_segment',
  'dictation_segment_inserted',
  'dictation_segment_review_flagged',
  'dictation_segment_edited',
  'dictation_segment_marked_reviewed',
  'dictation_session_stopped',
  'dictation_session_error',
];
