export type DictationMode =
  | 'provider_dictation'
  | 'ambient_listening'
  | 'uploaded_audio'
  | 'telehealth_capture';

export type DictationUiState =
  | 'idle'
  | 'permission_needed'
  | 'starting'
  | 'listening'
  | 'paused'
  | 'interim'
  | 'final_ready'
  | 'committed'
  | 'error'
  | 'stopped';

export type DictationCaptureState =
  | 'unsupported'
  | 'idle'
  | 'requesting_permission'
  | 'ready'
  | 'capturing'
  | 'paused'
  | 'stopped'
  | 'error';

export type DictationReviewStatus = 'not_required' | 'needs_review' | 'reviewed' | 'rejected';
export type DictationReviewSeverity = 'info' | 'moderate' | 'high' | 'critical';

export type DictationReviewFlagType =
  | 'risk_language'
  | 'negation'
  | 'medication'
  | 'dose'
  | 'allergy'
  | 'legal_status'
  | 'diagnosis'
  | 'mse_inference'
  | 'stigma'
  | 'low_confidence'
  | 'other';

export type DictationCommitMode = 'manual_accept' | 'auto_insert_final_segments';

export type DictationStopReason =
  | 'provider_stopped'
  | 'permission_revoked'
  | 'network_error'
  | 'provider_error'
  | 'encounter_closed'
  | 'timeout';

export type DictationTranscriptRetention = 'same_as_note' | 'audit_only' | 'none_after_insert';
export type DictationEventDomain = 'session' | 'frontend' | 'transcript' | 'editor' | 'safety';
export type DictationRetentionClass = 'transient' | 'clinical_record' | 'audit_only' | 'qa_sample';
export type DictationSourceMode = 'realtime' | 'batch' | 'local' | 'manual';
export type DictationTargetSection = 'clinicianNotes' | 'intakeCollateral' | 'patientTranscript' | 'objectiveData';

export type DictationEventName =
  | 'dictation_session_started'
  | 'dictation_draft_resumed'
  | 'dictation_permission_denied'
  | 'dictation_audio_stream_started'
  | 'dictation_interim_segment'
  | 'dictation_final_segment'
  | 'dictation_segment_inserted'
  | 'dictation_segment_review_flagged'
  | 'dictation_segment_edited'
  | 'dictation_segment_marked_reviewed'
  | 'dictation_session_stopped'
  | 'dictation_session_error';

export type DictationSafetyConfig = {
  flagNegation: boolean;
  flagRiskLanguage: boolean;
  flagMedications: boolean;
  flagLegalStatus: boolean;
  autoRewrite: false;
};

export type DictationRetentionConfig = {
  storeAudio: boolean;
  audioRetentionDays: number;
  storeInterimTranscripts: boolean;
  finalTranscriptRetention: DictationTranscriptRetention;
};

export type DictationEditorConfig = {
  commitMode: DictationCommitMode;
  dictationBoxFallback: boolean;
  provenanceMarkers: boolean;
};

export type DictationModuleConfig = {
  tenantId: string;
  enabled: boolean;
  defaultSttProvider: string;
  allowedSttProviders: string[];
  enableWebSpeechDevOnly: boolean;
  retention: DictationRetentionConfig;
  safety: DictationSafetyConfig;
  editor: DictationEditorConfig;
};

export type DictationSessionConfig = {
  tenantId: string;
  encounterId: string;
  noteId?: string;
  providerUserId: string;
  targetSection?: string;
  mode: DictationMode;
  sttProvider: string;
  language: string;
  vocabularyHints?: string[];
  commitMode: DictationCommitMode;
  retention: {
    storeAudio: boolean;
    audioRetentionDays: number;
    storeInterimTranscripts: boolean;
  };
};

export type TranscriptReviewFlag = {
  flagType: DictationReviewFlagType;
  severity: DictationReviewSeverity;
  matchedText: string;
  message: string;
  suggestedAction?: string;
};

export type TranscriptSegment = {
  id: string;
  dictationSessionId: string;
  encounterId: string;
  noteId?: string;
  targetSection?: string;
  text: string;
  normalizedText?: string;
  isFinal: boolean;
  confidence?: number;
  startMs?: number;
  endMs?: number;
  speakerLabel?: string;
  reviewStatus: DictationReviewStatus;
  reviewFlags: TranscriptReviewFlag[];
  insertedTransactionId?: string;
  source: {
    provider: string;
    modelOrEngine?: string;
    mode: DictationSourceMode;
    vendorSegmentId?: string;
  };
  createdAt: string;
};

export type LocalDictationSessionState = {
  sessionId: string;
  targetSection?: DictationTargetSection;
  uiState: DictationUiState;
  startedAt?: string;
  stoppedAt?: string;
  interimSegment?: TranscriptSegment;
  pendingSegments: TranscriptSegment[];
  insertedSegments: TranscriptSegment[];
  lastError?: string;
};

export type AudioChunk = {
  sessionId: string;
  sequence: number;
  data: ArrayBuffer;
  sampleRate?: number;
  channelCount?: number;
  capturedAt: string;
};

export type DictationSessionHandle = {
  sessionId: string;
  provider: string;
  expiresAt?: string;
};

export type DictationAudioChunkUpload = {
  sessionId: string;
  sequence: number;
  base64Audio: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
};

export type DictationProviderError = {
  code: string;
  message: string;
  retryable: boolean;
  providerErrorCode?: string;
};

export interface STTProvider {
  createSession(config: DictationSessionConfig): Promise<DictationSessionHandle>;
  streamAudio(chunk: AudioChunk): Promise<void>;
  onInterimSegment(callback: (segment: TranscriptSegment) => void): void;
  onFinalSegment(callback: (segment: TranscriptSegment) => void): void;
  onError(callback: (error: DictationProviderError) => void): void;
  closeSession(reason: DictationStopReason): Promise<void>;
}

export interface DictationEditorAdapter {
  getCurrentTarget(): { noteId: string; section?: string; cursorPosition?: unknown } | null;
  previewInterimSegment(segment: TranscriptSegment): void;
  insertFinalSegment(segment: TranscriptSegment): Promise<{ transactionId: string }>;
  applyReviewFlags(segmentId: string, flags: TranscriptReviewFlag[]): void;
  markSegmentReviewed(segmentId: string): Promise<void>;
  openDictationBox(initialText?: string): void;
}

export type DictationAuditEvent = {
  id: string;
  eventName: DictationEventName;
  eventDomain: DictationEventDomain;
  occurredAt: string;
  encounterId: string;
  noteId?: string;
  dictationSessionId?: string;
  actorUserId: string;
  sttProvider?: string;
  mode?: DictationMode;
  payload: Record<string, unknown>;
  containsPhi: boolean;
  retentionClass: DictationRetentionClass;
};
