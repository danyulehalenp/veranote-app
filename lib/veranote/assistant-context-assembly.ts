import type { AssistantApiContext, AssistantStage } from '@/types/assistant';
import type { AssistantContextSnapshot } from '@/lib/veranote/assistant-context';

export function resolveAssistantStageForPathname(pathname: string): AssistantStage | null {
  if (pathname === '/') {
    return 'compose';
  }

  if (pathname === '/dashboard/review') {
    return 'review';
  }

  return null;
}

export function assembleAssistantApiContext(snapshot?: Partial<AssistantContextSnapshot> | null): AssistantApiContext & { stage?: AssistantStage } {
  if (!snapshot) {
    return {};
  }

  return {
    stage: snapshot.stage,
    userAiName: snapshot.userAiName,
    userAiRole: snapshot.userAiRole,
    userAiAvatar: snapshot.userAiAvatar,
    noteType: snapshot.noteType,
    specialty: snapshot.specialty,
    currentDraftText: snapshot.currentDraftText,
    providerProfileId: snapshot.providerProfileId,
    providerProfileName: snapshot.providerProfileName,
    providerAddressingName: snapshot.providerAddressingName,
    veraInteractionStyle: snapshot.veraInteractionStyle,
    veraProactivityLevel: snapshot.veraProactivityLevel,
    veraMemoryNotes: snapshot.veraMemoryNotes,
    outputDestination: snapshot.outputDestination,
    customInstructions: snapshot.customInstructions,
    presetName: snapshot.presetName,
    selectedPresetId: snapshot.selectedPresetId,
    focusedSectionHeading: snapshot.focusedSectionHeading,
    focusedSectionSentence: snapshot.focusedSectionSentence,
    focusedEvidenceCount: snapshot.focusedEvidenceCount,
    contradictionCount: snapshot.contradictionCount,
    highRiskWarningTitles: snapshot.highRiskWarningTitles,
    topHighRiskWarningId: snapshot.topHighRiskWarningId,
    topHighRiskWarningTitle: snapshot.topHighRiskWarningTitle,
    topHighRiskWarningDetail: snapshot.topHighRiskWarningDetail,
    topHighRiskWarningReviewHint: snapshot.topHighRiskWarningReviewHint,
    phaseTwoCueCount: snapshot.phaseTwoCueCount,
    needsReviewCount: snapshot.needsReviewCount,
    unreviewedCount: snapshot.unreviewedCount,
    destinationConstraintActive: snapshot.destinationConstraintActive,
  };
}
