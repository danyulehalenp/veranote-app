export type AssistantStage = 'compose' | 'review';

export type AssistantMode = 'workflow-help' | 'prompt-builder' | 'reference-lookup';

export type AssistantModeMeta = {
  mode: AssistantMode;
  label: string;
  shortLabel: string;
  detail: string;
};

export type AssistantMessageRole = 'provider' | 'assistant';

export type AssistantReferenceSource = {
  label: string;
  url: string;
  sourceType?: 'external' | 'internal';
};

export type AssistantExternalAnswerConfidenceLevel =
  | 'direct-trusted-page'
  | 'trusted-search-path'
  | 'not-yet-taught';

export type AssistantExternalAnswerMeta = {
  level: AssistantExternalAnswerConfidenceLevel;
  label: string;
  detail: string;
};

export type AssistantThreadTurn = {
  role: AssistantMessageRole;
  content: string;
};

export type AssistantMessage = {
  id: string;
  role: AssistantMessageRole;
  content: string;
  suggestions?: string[];
  references?: AssistantReferenceSource[];
  externalAnswerMeta?: AssistantExternalAnswerMeta;
  modeMeta?: AssistantModeMeta;
};

export type AssistantAction =
  | {
      type: 'replace-preferences';
      label: string;
      instructions: string;
    }
  | {
      type: 'append-preferences';
      label: string;
      instructions: string;
    }
  | {
      type: 'create-preset-draft';
      label: string;
      instructions: string;
      presetName: string;
    }
  | {
      type: 'jump-to-source-evidence';
      label: string;
      instructions: string;
    }
  | {
      type: 'run-review-rewrite';
      label: string;
      instructions: string;
      rewriteMode: 'more-concise' | 'more-formal' | 'closer-to-source' | 'regenerate-full-note';
    }
  | {
      type: 'apply-conservative-rewrite';
      label: string;
      instructions: string;
      originalText: string;
      replacementText: string;
      optionTone: 'most-conservative' | 'balanced' | 'closest-to-source';
    }
  | {
      type: 'apply-note-revision';
      label: string;
      instructions: string;
      revisionText: string;
      targetSectionHeading?: string;
    }
  | {
      type: 'send-beta-feedback';
      label: string;
      instructions: string;
      feedbackCategory: 'feature-request' | 'general';
      feedbackMessage: string;
      pageContext: string;
    };

export type AssistantResponsePayload = {
  message: string;
  suggestions?: string[];
  actions?: AssistantAction[];
  references?: AssistantReferenceSource[];
  externalAnswerMeta?: AssistantExternalAnswerMeta;
  modeMeta?: AssistantModeMeta;
};

export type AssistantApiContext = {
  noteType?: string;
  specialty?: string;
  currentDraftText?: string;
  providerProfileId?: string;
  providerProfileName?: string;
  providerAddressingName?: string;
  veraInteractionStyle?: 'warm-professional' | 'formal' | 'friendly';
  veraProactivityLevel?: 'light' | 'balanced' | 'anticipatory';
  veraMemoryNotes?: string;
  outputDestination?: string;
  customInstructions?: string;
  presetName?: string;
  selectedPresetId?: string;
  focusedSectionHeading?: string;
  focusedSectionSentence?: string;
  focusedEvidenceCount?: number;
  contradictionCount?: number;
  highRiskWarningTitles?: string[];
  topHighRiskWarningId?: string;
  topHighRiskWarningTitle?: string;
  topHighRiskWarningDetail?: string;
  topHighRiskWarningReviewHint?: string;
  phaseTwoCueCount?: number;
  needsReviewCount?: number;
  unreviewedCount?: number;
  destinationConstraintActive?: boolean;
};
