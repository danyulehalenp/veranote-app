import { applyAssistantSafety } from '@/lib/veranote/assistant-safety';
import {
  buildAssistantIntentTrace,
  normalizeAssistantMessage,
  normalizeAssistantIntentText,
  resolveAssistantMode,
  resolveAssistantStage,
  type AssistantRequestEnvelope,
} from '@/lib/veranote/assistant-intent';
import type {
  AssistantApiContext,
  AssistantMode,
  AssistantResponsePayload,
  AssistantStage,
  AssistantThreadTurn,
} from '@/types/assistant';

export type AssistantOrchestratorBuilders = {
  buildBoundaryHelp: (normalizedMessage: string) => AssistantResponsePayload | null;
  buildConversationalHelp: (normalizedMessage: string, context?: AssistantApiContext) => AssistantResponsePayload | null;
  buildInternalKnowledgeHelp: (normalizedMessage: string, context?: AssistantApiContext) => AssistantResponsePayload | null;
  buildReferenceLookupHelp: (normalizedMessage: string, context?: AssistantApiContext) => AssistantResponsePayload | null;
  buildGeneralKnowledgeHelp: (normalizedMessage: string, context?: AssistantApiContext) => AssistantResponsePayload | null;
  buildPrivacyTrustHelp: (normalizedMessage: string) => AssistantResponsePayload | null;
  buildSupportAndTrainingHelp: (normalizedMessage: string) => AssistantResponsePayload | null;
  buildRequestedRevisionHelp: (
    normalizedMessage: string,
    rawMessage: string,
    stage: AssistantStage,
    context?: AssistantApiContext,
  ) => AssistantResponsePayload | null;
  buildProvenanceHelp: (
    normalizedMessage: string,
    stage: AssistantStage,
    context?: AssistantApiContext,
  ) => AssistantResponsePayload | null;
  buildPromptBuilderHelp: (
    stage: AssistantStage,
    rawMessage: string,
    context?: AssistantApiContext,
  ) => AssistantResponsePayload;
  buildDirectReviewHelp: (normalizedMessage: string, context?: AssistantApiContext) => AssistantResponsePayload | null;
  buildReviewScenarioHelp: (normalizedMessage: string, context?: AssistantApiContext) => AssistantResponsePayload | null;
  buildUnknownQuestionFallback: (message: string) => AssistantResponsePayload | null;
  buildWorkflowHelp: (stage: AssistantStage, context?: AssistantApiContext) => AssistantResponsePayload;
  buildContextualSectionDraftHelp: (
    normalizedMessage: string,
    rawMessage: string,
    recentMessages: AssistantThreadTurn[] | undefined,
    context?: AssistantApiContext,
  ) => AssistantResponsePayload | null;
  buildDirectComposeHelp: (normalizedMessage: string, context?: AssistantApiContext) => AssistantResponsePayload | null;
  buildMixedDomainComposeHelp: (
    normalizedMessage: string,
    rawMessage: string,
    context?: AssistantApiContext,
  ) => AssistantResponsePayload | null;
  buildRawDetailComposeHelp: (rawMessage: string, context?: AssistantApiContext) => AssistantResponsePayload | null;
  buildComposeScenarioHelp: (normalizedMessage: string, context?: AssistantApiContext) => AssistantResponsePayload | null;
};

export type AssistantOrchestratorResult = {
  stage: AssistantStage;
  mode: AssistantMode;
  message: string;
  normalizedMessage: string;
  context?: AssistantApiContext;
  recentMessages: AssistantThreadTurn[];
  intentTrace: string[];
  payload: AssistantResponsePayload;
};

export function orchestrateAssistantResponse(
  body: AssistantRequestEnvelope,
  builders: AssistantOrchestratorBuilders,
): AssistantOrchestratorResult {
  const stage = resolveAssistantStage(body.stage);
  const mode = resolveAssistantMode(body.mode);
  const message = normalizeAssistantMessage(body.message);
  const normalizedMessage = normalizeAssistantIntentText(message);
  const context = body.context;
  const recentMessages = Array.isArray(body.recentMessages) ? body.recentMessages : [];

  const rawPayload =
    builders.buildBoundaryHelp(normalizedMessage)
    || builders.buildConversationalHelp(normalizedMessage, context)
    || (mode === 'reference-lookup'
      ? builders.buildReferenceLookupHelp(normalizedMessage, context)
      : builders.buildGeneralKnowledgeHelp(normalizedMessage, context)
        || builders.buildInternalKnowledgeHelp(normalizedMessage, context))
    || builders.buildPrivacyTrustHelp(normalizedMessage)
    || builders.buildSupportAndTrainingHelp(normalizedMessage)
    || builders.buildRequestedRevisionHelp(normalizedMessage, message, stage, context)
    || builders.buildProvenanceHelp(normalizedMessage, stage, context)
    || (mode === 'prompt-builder'
      ? builders.buildPromptBuilderHelp(stage, message, context)
      : stage === 'review'
        ? builders.buildDirectReviewHelp(normalizedMessage, context)
          || builders.buildReviewScenarioHelp(normalizedMessage, context)
          || builders.buildUnknownQuestionFallback(message)
          || builders.buildWorkflowHelp(stage, context)
        : builders.buildContextualSectionDraftHelp(normalizedMessage, message, recentMessages, context)
          || builders.buildDirectComposeHelp(normalizedMessage, context)
          || builders.buildMixedDomainComposeHelp(normalizedMessage, message, context)
          || builders.buildRawDetailComposeHelp(message, context)
          || builders.buildComposeScenarioHelp(normalizedMessage, context)
          || builders.buildUnknownQuestionFallback(message)
          || builders.buildWorkflowHelp(stage, context));

  return {
    stage,
    mode,
    message,
    normalizedMessage,
    context,
    recentMessages,
    intentTrace: buildAssistantIntentTrace({
      stage,
      mode,
      normalizedMessage,
      context,
      recentMessages,
    }),
    payload: applyAssistantSafety(rawPayload),
  };
}
