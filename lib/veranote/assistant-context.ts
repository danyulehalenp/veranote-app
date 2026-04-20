import type { AssistantStage } from '@/types/assistant';

export type AssistantContextSnapshot = {
  stage: AssistantStage;
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

export const ASSISTANT_CONTEXT_EVENT = 'veranote-assistant-context';
export const ASSISTANT_ACTION_EVENT = 'veranote-assistant-action';
export const ASSISTANT_PENDING_ACTION_KEY = 'veranote:assistant-pending-action';

export function publishAssistantContext(detail: AssistantContextSnapshot) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<AssistantContextSnapshot>(ASSISTANT_CONTEXT_EVENT, { detail }));
}

export function publishAssistantAction(detail: {
  type: 'replace-preferences' | 'append-preferences' | 'create-preset-draft' | 'jump-to-source-evidence' | 'run-review-rewrite' | 'apply-conservative-rewrite' | 'apply-note-revision';
  instructions: string;
  presetName?: string;
  rewriteMode?: 'more-concise' | 'more-formal' | 'closer-to-source' | 'regenerate-full-note';
  originalText?: string;
  replacementText?: string;
  revisionText?: string;
  targetSectionHeading?: string;
}) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(ASSISTANT_ACTION_EVENT, { detail }));
}
