import type {
  AmbientCareSetting,
  AmbientCaptureRuntime,
  AmbientConsentMethod,
  AmbientConsentScope,
  AmbientDraftSentence,
  AmbientListeningMode,
  AmbientParticipant,
  AmbientParticipantRole,
  AmbientReviewFlag,
  AmbientTranscriptSourceKind,
  AmbientTranscriptTurn,
} from '@/types/ambient-listening';

export type AmbientSessionSetupDraft = {
  mode: AmbientListeningMode;
  careSetting: AmbientCareSetting;
  captureRuntime: AmbientCaptureRuntime;
  transcriptSimulator: Extract<AmbientTranscriptSourceKind, 'mock_seeded' | 'live_stream_adapter'>;
  providerState?: string | null;
  patientState?: string | null;
  participants: Array<{
    participantId: string;
    role: AmbientParticipantRole;
    displayLabel: string;
    minorOrDependent: boolean;
  }>;
};

export type AmbientConsentEventDraft = {
  participantId: string;
  status: 'granted' | 'declined' | 'withdrawn';
  method: AmbientConsentMethod;
  scope: AmbientConsentScope;
  notes?: string | null;
};

export type AmbientTranscriptTurnViewModel = AmbientTranscriptTurn & {
  severityBadges: string[];
  attributionNeedsReview: boolean;
  textNeedsReview: boolean;
  linkedDraftSentenceIds: string[];
  providerConfirmed: boolean;
};

export type AmbientDraftSentenceViewModel = AmbientDraftSentence & {
  supportSummary: string;
  primaryTurnIds: string[];
  blockingFlagIds: string[];
  accepted: boolean;
  rejected: boolean;
};

export type AmbientDraftSectionViewModel = {
  sectionId: string;
  label: string;
  sentences: AmbientDraftSentenceViewModel[];
};

const defaultConsentScope: AmbientConsentScope = {
  recording: true,
  transcription: true,
  aiDraftGeneration: true,
  audioRetention: false,
  thirdPartyProcessing: true,
  ehrInsertion: true,
};

export function getAmbientMockSetupDraft(): AmbientSessionSetupDraft {
  return {
    mode: 'ambient_in_room',
    careSetting: 'outpatient_psychiatry',
    captureRuntime: 'simulation',
    transcriptSimulator: 'mock_seeded',
    providerState: 'TX',
    patientState: 'TX',
    participants: [
      {
        participantId: 'provider-1',
        role: 'provider',
        displayLabel: 'Provider',
        minorOrDependent: false,
      },
      {
        participantId: 'patient-1',
        role: 'patient',
        displayLabel: 'Patient',
        minorOrDependent: false,
      },
      {
        participantId: 'family-1',
        role: 'family_member',
        displayLabel: 'Mother',
        minorOrDependent: false,
      },
    ],
  };
}

export function getAmbientMockParticipants(): AmbientParticipant[] {
  return [
    {
      participantId: 'provider-1',
      role: 'provider',
      displayLabel: 'Provider',
      consentStatus: 'granted',
      minorOrDependent: false,
      speakerLabel: 'Speaker A',
    },
    {
      participantId: 'patient-1',
      role: 'patient',
      displayLabel: 'Patient',
      consentStatus: 'granted',
      minorOrDependent: false,
      speakerLabel: 'Speaker B',
    },
    {
      participantId: 'family-1',
      role: 'family_member',
      displayLabel: 'Mother',
      relationshipToPatient: 'mother',
      consentStatus: 'granted',
      minorOrDependent: false,
      speakerLabel: 'Speaker C',
    },
  ];
}

export function getAmbientMockConsentDrafts(): AmbientConsentEventDraft[] {
  return [
    {
      participantId: 'provider-1',
      status: 'granted',
      method: 'written',
      scope: { ...defaultConsentScope },
    },
    {
      participantId: 'patient-1',
      status: 'granted',
      method: 'verbal',
      scope: { ...defaultConsentScope },
    },
    {
      participantId: 'family-1',
      status: 'granted',
      method: 'verbal',
      scope: { ...defaultConsentScope },
      notes: 'Collateral consented to recording and AI drafting for internal testing.',
    },
  ];
}

export function getAmbientMockTurns(): AmbientTranscriptTurnViewModel[] {
  return [
    {
      id: 'turn-1',
      sessionId: 'ambient-1',
      startMs: 0,
      endMs: 4200,
      speakerRole: 'provider',
      speakerLabel: 'Speaker A',
      speakerConfidence: 0.97,
      text: 'Tell me what felt hardest overnight and whether home still feels unsafe.',
      normalizedText: null,
      textConfidence: 0.96,
      isFinal: true,
      excludedFromDraft: false,
      exclusionReason: null,
      clinicalConcepts: [],
      riskMarkers: [],
      severityBadges: [],
      attributionNeedsReview: false,
      textNeedsReview: false,
      linkedDraftSentenceIds: [],
      providerConfirmed: false,
    },
    {
      id: 'turn-2',
      sessionId: 'ambient-1',
      startMs: 4600,
      endMs: 11600,
      speakerRole: 'patient',
      speakerLabel: 'Speaker B',
      speakerConfidence: 0.82,
      text: 'I barely slept and I still do not feel safe going home.',
      normalizedText: null,
      textConfidence: 0.95,
      isFinal: true,
      excludedFromDraft: false,
      exclusionReason: null,
      clinicalConcepts: ['sleep disturbance'],
      riskMarkers: ['not safe going home'],
      severityBadges: ['risk language', 'speaker review'],
      attributionNeedsReview: true,
      textNeedsReview: false,
      linkedDraftSentenceIds: ['sentence-1'],
      providerConfirmed: false,
    },
    {
      id: 'turn-3',
      sessionId: 'ambient-1',
      startMs: 12100,
      endMs: 18800,
      speakerRole: 'family_member',
      speakerLabel: 'Speaker C',
      speakerConfidence: 0.91,
      text: 'He texted goodbye last night and I do not think he should be alone tonight.',
      normalizedText: null,
      textConfidence: 0.94,
      isFinal: true,
      excludedFromDraft: false,
      exclusionReason: null,
      clinicalConcepts: ['collateral concern'],
      riskMarkers: ['goodbye text'],
      severityBadges: ['collateral contradiction'],
      attributionNeedsReview: false,
      textNeedsReview: false,
      linkedDraftSentenceIds: ['sentence-2'],
      providerConfirmed: false,
    },
  ];
}

export function getAmbientMockSections(): AmbientDraftSectionViewModel[] {
  return [
    {
      sectionId: 'history',
      label: 'Interval History',
      sentences: [
        {
          sentenceId: 'sentence-3',
          text: 'Patient reports poor sleep overnight.',
          evidenceAnchors: [
            {
              turnId: 'turn-2',
              startChar: 9,
              endChar: 22,
              supportType: 'paraphrase',
              confidence: 0.92,
            },
          ],
          assertionType: 'reported',
          confidence: 0.89,
          supportSummary: '1 paraphrased patient turn',
          primaryTurnIds: ['turn-2'],
          blockingFlagIds: ['flag-speaker-1'],
          accepted: false,
          rejected: false,
        },
      ],
    },
    {
      sectionId: 'risk',
      label: 'Safety / Risk',
      sentences: [
        {
          sentenceId: 'sentence-1',
          text: 'Patient reports not feeling safe to return home.',
          evidenceAnchors: [
            {
              turnId: 'turn-2',
              startChar: 31,
              endChar: 58,
              supportType: 'direct',
              confidence: 0.95,
            },
          ],
          assertionType: 'risk',
          confidence: 0.86,
          supportSummary: '1 direct patient turn',
          primaryTurnIds: ['turn-2'],
          blockingFlagIds: ['flag-speaker-1'],
          accepted: false,
          rejected: false,
        },
        {
          sentenceId: 'sentence-2',
          text: 'Collateral reports a goodbye text last night and concern that the patient should not be left alone.',
          evidenceAnchors: [
            {
              turnId: 'turn-3',
              startChar: 0,
              endChar: 73,
              supportType: 'paraphrase',
              confidence: 0.93,
            },
          ],
          assertionType: 'risk',
          confidence: 0.9,
          supportSummary: '1 collateral turn',
          primaryTurnIds: ['turn-3'],
          blockingFlagIds: [],
          accepted: false,
          rejected: false,
        },
      ],
    },
  ];
}

export function getAmbientMockReviewFlags(): AmbientReviewFlag[] {
  return [
    {
      flagId: 'flag-speaker-1',
      category: 'speaker_attribution',
      severity: 'high',
      message: 'A patient-risk sentence is tied to a turn with speaker confidence below the desired threshold. Confirm or relabel before accepting note wording.',
      sourceTurnIds: ['turn-2'],
      status: 'open',
    },
    {
      flagId: 'flag-risk-1',
      category: 'risk_language',
      severity: 'moderate',
      message: 'Safety concerns appear across patient and collateral speakers. Keep both sources visible rather than collapsing them.',
      sourceTurnIds: ['turn-2', 'turn-3'],
      status: 'open',
    },
  ];
}
