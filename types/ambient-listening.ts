export type AmbientListeningMode =
  | 'ambient_in_room'
  | 'ambient_telehealth'
  | 'family_or_collateral'
  | 'group_session'
  | 'uploaded_audio'
  | 'simulation';

export type AmbientCaptureRuntime = 'simulation' | 'real_microphone';

export type AmbientCareSetting =
  | 'outpatient_psychiatry'
  | 'outpatient_therapy'
  | 'inpatient'
  | 'ed_crisis'
  | 'telehealth'
  | 'other';

export type AmbientSessionState =
  | 'idle'
  | 'consent_pending'
  | 'ready_to_record'
  | 'recording'
  | 'paused'
  | 'off_record'
  | 'processing_transcript'
  | 'draft_generation_pending'
  | 'draft_ready'
  | 'needs_review'
  | 'accepted_into_note'
  | 'finalized'
  | 'discarded';

export type AmbientTranscriptSourceKind = 'none' | 'mock_seeded' | 'live_stream_adapter' | 'batch_transcription';
export type AmbientTranscriptDeliveryTransport = 'none' | 'polling_pull' | 'stream_push';
export type AmbientTranscriptEventType = 'interim_turn' | 'final_turn';
export type AmbientTranscriptTransportPhase =
  | 'idle'
  | 'streaming_live'
  | 'replaying_buffered'
  | 'flushing_after_stop'
  | 'awaiting_draft_generation';

export type AmbientParticipantRole =
  | 'patient'
  | 'provider'
  | 'guardian'
  | 'caregiver'
  | 'family_member'
  | 'interpreter'
  | 'student_observer'
  | 'other_clinician'
  | 'unknown';

export type AmbientConsentStatus = 'not_required' | 'pending' | 'granted' | 'declined' | 'withdrawn' | 'unknown';
export type AmbientConsentMethod = 'verbal' | 'written' | 'portal_pre_authorized' | 'implied_by_policy' | 'not_applicable';
export type AmbientRecordingConsentModel = 'unknown' | 'one_party' | 'all_party' | 'mixed' | 'stricter_policy_applied';
export type AmbientReviewSeverity = 'low' | 'moderate' | 'high' | 'critical';
export type AmbientReviewStatus = 'open' | 'resolved' | 'dismissed' | 'accepted_with_attestation';
export type AmbientTranscriptRetention = 'session_only' | 'until_note_finalized' | 'short_ttl' | 'retain_with_record' | 'tenant_policy';
export type AmbientEvidenceRetention = 'none' | 'accepted_assertions_only' | 'tenant_policy';

export type AmbientFlagCategory =
  | 'consent'
  | 'speaker_attribution'
  | 'negation'
  | 'risk_language'
  | 'psychosis'
  | 'medication'
  | 'diagnosis'
  | 'legal_status'
  | 'unsupported_claim'
  | 'process_note_boundary'
  | 'stigma'
  | 'other';

export type AmbientAuditEventName =
  | 'ambient_session_created'
  | 'ambient_consent_granted'
  | 'ambient_consent_declined'
  | 'ambient_consent_withdrawn'
  | 'ambient_recording_started'
  | 'ambient_recording_paused'
  | 'ambient_recording_resumed'
  | 'ambient_recording_stopped'
  | 'ambient_transcript_turn_received'
  | 'ambient_draft_generated'
  | 'ambient_review_flag_opened'
  | 'ambient_note_section_accepted'
  | 'ambient_note_finalized'
  | 'ambient_retention_job_applied'
  | 'ambient_session_discarded';

export type AmbientConsentScope = {
  recording: boolean;
  transcription: boolean;
  aiDraftGeneration: boolean;
  audioRetention: boolean;
  thirdPartyProcessing: boolean;
  ehrInsertion: boolean;
};

export type AmbientParticipant = {
  participantId: string;
  role: AmbientParticipantRole;
  displayLabel: string;
  relationshipToPatient?: string | null;
  consentStatus: AmbientConsentStatus;
  minorOrDependent: boolean;
  speakerLabel?: string | null;
};

export type AmbientConsentEvent = {
  id: string;
  sessionId: string;
  participantId: string;
  participantRole: AmbientParticipantRole;
  status: Exclude<AmbientConsentStatus, 'pending' | 'unknown'> | 'revoked_prior';
  method: AmbientConsentMethod;
  scope: AmbientConsentScope;
  recordedAt: string;
  recordedByUserId: string;
  scriptVersion?: string | null;
  withdrawalReason?: string | null;
  notes?: string | null;
};

export type AmbientRetentionPolicy = {
  policyId: string;
  retainRawAudio: boolean;
  rawAudioTtlHours?: number | null;
  transcriptRetention: AmbientTranscriptRetention;
  transcriptTtlHours?: number | null;
  evidenceSnippetRetention: AmbientEvidenceRetention;
};

export type AmbientListeningModuleConfig = {
  tenantId: string;
  enabled: boolean;
  defaultProvider: string;
  allowedProviders: string[];
  requireConsentGate: boolean;
  requireVisibleRecordingIndicator: boolean;
  blockIfJurisdictionUnknown: boolean;
  requireEvidenceAnchors: boolean;
  allowRawAudioRetention: boolean;
  defaultRetentionPolicy: AmbientRetentionPolicy;
  safety: {
    flagNegation: boolean;
    flagRiskLanguage: boolean;
    flagMedications: boolean;
    flagPsychosis: boolean;
    flagLegalStatus: boolean;
    flagUnsupportedClaims: boolean;
    flagProcessNoteBoundary: boolean;
    autoFinalize: false;
  };
};

export type AmbientSession = {
  id: string;
  tenantId: string;
  encounterId: string;
  providerUserId: string;
  mode: AmbientListeningMode;
  careSetting: AmbientCareSetting;
  state: AmbientSessionState;
  jurisdictionContext: {
    providerState?: string | null;
    patientState?: string | null;
    recordingConsentModel: AmbientRecordingConsentModel;
    telehealthConsentRequired?: boolean | null;
  };
  participants: AmbientParticipant[];
  consentPolicy: {
    policyId: string;
    requiresAllAudibleParticipants: boolean;
    allowVerbalConsent: boolean;
    blockIfUnknownJurisdiction: boolean;
    approvedScriptVersion?: string | null;
  };
  retentionPolicy: AmbientRetentionPolicy;
  sttProviderId?: string | null;
  llmProviderId?: string | null;
  createdAt: string;
  startedAt?: string | null;
  stoppedAt?: string | null;
};

export type AmbientTranscriptTurn = {
  id: string;
  sessionId: string;
  startMs: number;
  endMs: number;
  speakerRole: AmbientParticipantRole;
  speakerLabel?: string | null;
  speakerConfidence: number;
  text: string;
  normalizedText?: string | null;
  textConfidence: number;
  isFinal: boolean;
  excludedFromDraft: boolean;
  exclusionReason?: string | null;
  clinicalConcepts: string[];
  riskMarkers: string[];
};

export type AmbientTranscriptReviewHints = {
  severityBadges?: string[];
  attributionNeedsReview?: boolean;
  textNeedsReview?: boolean;
  linkedDraftSentenceIds?: string[];
  providerConfirmed?: boolean;
};

export type AmbientTranscriptEventEnvelope = {
  id: string;
  eventType: AmbientTranscriptEventType;
  occurredAt: string;
  sourceKind: Exclude<AmbientTranscriptSourceKind, 'none'>;
  deliveryTransport?: Exclude<AmbientTranscriptDeliveryTransport, 'none'>;
  turn: AmbientTranscriptTurn;
  reviewHints?: AmbientTranscriptReviewHints;
};

export type AmbientTranscriptAdapterDescriptor = {
  adapterId: string;
  adapterLabel: string;
  sourceKind: Exclude<AmbientTranscriptSourceKind, 'none'>;
  defaultDeliveryTransport: Exclude<AmbientTranscriptDeliveryTransport, 'none'>;
  supportsBufferedReplay: boolean;
  supportsStreamPush: boolean;
};

export type AmbientTranscriptIngressTurn = {
  id?: string;
  startMs: number;
  endMs: number;
  speakerRole?: AmbientParticipantRole;
  speakerLabel?: string | null;
  speakerConfidence?: number;
  text: string;
  normalizedText?: string | null;
  textConfidence?: number;
  isFinal: boolean;
  excludedFromDraft?: boolean;
  exclusionReason?: string | null;
  clinicalConcepts?: string[];
  riskMarkers?: string[];
  reviewHints?: AmbientTranscriptReviewHints;
};

export type AmbientTranscriptIngressEvent = {
  id?: string;
  eventType?: AmbientTranscriptEventType;
  occurredAt?: string;
  turn: AmbientTranscriptIngressTurn;
};

export type AmbientSttProviderId =
  | 'deepgram-batch-diarization'
  | 'openai-batch-transcription'
  | 'mock-simulation';

export type AmbientSttWordTiming = {
  word: string;
  startMs: number;
  endMs: number;
  confidence?: number | null;
  speakerLabel?: string | null;
};

export type AmbientSttSegment = {
  segmentId: string;
  text: string;
  startMs: number;
  endMs: number;
  isFinal: boolean;
  textConfidence?: number | null;
  speakerLabel?: string | null;
  speakerConfidence?: number | null;
  wordTimings?: AmbientSttWordTiming[];
  rawProviderMetadata?: Record<string, unknown> | null;
};

export type AmbientSttProviderError = {
  providerId: AmbientSttProviderId;
  code: string;
  message: string;
  retryable: boolean;
  rawProviderMetadata?: Record<string, unknown> | null;
};

export type AmbientBatchTranscriptionProviderResult = {
  providerId: AmbientSttProviderId;
  providerLabel: string;
  transcriptText: string;
  segments: AmbientSttSegment[];
  rawProviderMetadata?: Record<string, unknown> | null;
};

export type AmbientEvidenceAnchor = {
  turnId: string;
  startChar: number;
  endChar: number;
  supportType: 'direct' | 'paraphrase' | 'inferred' | 'chart_context' | 'provider_confirmed';
  confidence: number;
};

export type AmbientDraftSentence = {
  sentenceId: string;
  text: string;
  evidenceAnchors: AmbientEvidenceAnchor[];
  assertionType: 'reported' | 'observed' | 'clinician_assessment' | 'plan' | 'risk' | 'medication' | 'diagnosis' | 'administrative' | 'unknown';
  confidence: number;
};

export type AmbientReviewFlag = {
  flagId: string;
  category: AmbientFlagCategory;
  severity: AmbientReviewSeverity;
  message: string;
  sourceTurnIds: string[];
  status: AmbientReviewStatus;
};

export type AmbientNoteDraft = {
  id: string;
  sessionId: string;
  encounterId: string;
  status: 'draft' | 'needs_review' | 'accepted_partially' | 'accepted' | 'rejected' | 'discarded';
  sections: Array<{
    sectionId: string;
    sectionType: string;
    text: string;
    sentences: AmbientDraftSentence[];
    status: 'draft' | 'accepted' | 'edited' | 'rejected' | 'needs_review';
  }>;
  reviewFlags: AmbientReviewFlag[];
};

export function hasAmbientRequiredConsent(session: AmbientSession): boolean {
  if (session.consentPolicy.requiresAllAudibleParticipants) {
    return session.participants.every((participant) => participant.consentStatus === 'granted' || participant.consentStatus === 'not_required');
  }

  return session.participants.some((participant) => participant.role === 'patient' && participant.consentStatus === 'granted');
}

export function canStartAmbientRecording(session: AmbientSession): { ok: boolean; reason?: string } {
  if (session.state !== 'ready_to_record' && session.state !== 'consent_pending') {
    return { ok: false, reason: `Session state ${session.state} cannot start recording.` };
  }

  if (session.consentPolicy.blockIfUnknownJurisdiction && session.jurisdictionContext.recordingConsentModel === 'unknown') {
    return { ok: false, reason: 'Recording jurisdiction unknown.' };
  }

  if (!hasAmbientRequiredConsent(session)) {
    return { ok: false, reason: 'Required participant consent missing.' };
  }

  if (session.retentionPolicy.retainRawAudio && session.retentionPolicy.rawAudioTtlHours == null) {
    return { ok: false, reason: 'Raw audio retention enabled without explicit TTL.' };
  }

  return { ok: true };
}
