import { resolveAssistantKnowledge } from '@/lib/veranote/assistant-knowledge';
import { detectContradictions } from '@/lib/veranote/assistant-contradiction-detector';
import { parseMSEFromText } from '@/lib/veranote/assistant-mse-parser';
import { detectRiskSignals, type RiskAnalysis } from '@/lib/veranote/assistant-risk-detector';
import { filterKnowledgeByPolicy } from '@/lib/veranote/assistant-source-policy';
import type { ContradictionAnalysis } from '@/lib/veranote/assistant-contradiction-detector';
import type { MseAnalysis } from '@/lib/veranote/assistant-mse-parser';
import type { KnowledgeBundle, KnowledgeIntent } from '@/lib/veranote/knowledge/types';
import type { AssistantAnswerMode, AssistantBuilderFamily, AssistantThreadTurn } from '@/types/assistant';

export type AssistantPipelineResult = {
  mse: MseAnalysis;
  risk: RiskAnalysis;
  contradictions: ContradictionAnalysis;
  knowledge: KnowledgeBundle;
};

export type AssistantPriorClinicalState = {
  answerMode?: AssistantAnswerMode;
  builderFamily?: AssistantBuilderFamily;
};

function inferAnswerModeFromContent(content: string): AssistantAnswerMode | undefined {
  const normalized = content.toLowerCase();

  if (normalized.includes('source-supported mse findings:')) {
    return 'mse_completion_limits';
  }

  if (normalized.includes('chart-ready wording:')) {
    return 'chart_ready_wording';
  }

  if (normalized.startsWith('warning:') || normalized.includes(' warning:')) {
    return 'warning_language';
  }

  if (normalized.startsWith('clinical explanation:')) {
    return 'clinical_explanation';
  }

  if (normalized.startsWith('workflow guidance:')) {
    return 'workflow_guidance';
  }

  return undefined;
}

function inferBuilderFamilyFromContent(content: string): AssistantBuilderFamily | undefined {
  const normalized = content.toLowerCase();

  if (normalized.includes('source-supported mse findings:')) {
    return 'mse';
  }

  if (normalized.includes('overdose if sent home') || normalized.includes('hold language')) {
    return 'hold';
  }

  if (normalized.includes('discharge remains unresolved') || normalized.includes('safe home plan')) {
    return 'discharge';
  }

  if (normalized.includes('patient reports') && normalized.includes('collateral reports')) {
    return 'contradiction';
  }

  if (normalized.includes('withdrawal remains in the differential') || normalized.includes('medical versus psychiatric overlap remains unresolved')) {
    return 'overlap';
  }

  if (normalized.includes('decision-specific') && normalized.includes('capacity')) {
    return 'capacity';
  }

  if (normalized.includes('malingering')) {
    return 'malingering';
  }

  if (normalized.includes('fragmented source')) {
    return 'fragmented-source';
  }

  if (normalized.includes('routine stimulant restart') || normalized.includes('routine adhd')) {
    return 'medication-boundary';
  }

  if (normalized.startsWith('chart-ready wording:')) {
    return 'chart-wording';
  }

  if (normalized.startsWith('warning:')) {
    return 'risk';
  }

  if (normalized.startsWith('workflow guidance:')) {
    return 'workflow';
  }

  return undefined;
}

export function extractPriorClinicalState(recentMessages?: AssistantThreadTurn[]): AssistantPriorClinicalState | null {
  if (!recentMessages?.length) {
    return null;
  }

  const lastAssistantTurn = [...recentMessages].reverse().find((turn) => turn.role === 'assistant' && turn.content.trim());
  if (!lastAssistantTurn) {
    return null;
  }

  const answerMode = lastAssistantTurn.answerMode || inferAnswerModeFromContent(lastAssistantTurn.content);
  const builderFamily = lastAssistantTurn.builderFamily || inferBuilderFamilyFromContent(lastAssistantTurn.content);

  if (!answerMode && !builderFamily) {
    return null;
  }

  return {
    answerMode,
    builderFamily,
  };
}

export async function runAssistantPipeline({
  message,
  sourceText,
  intent,
  stage,
  noteType,
}: {
  message: string;
  sourceText: string;
  intent: KnowledgeIntent;
  stage?: 'compose' | 'review';
  noteType?: string;
}): Promise<AssistantPipelineResult> {
  const sourceBoundText = sourceText.trim();
  const taskText = message.trim();
  const mse = parseMSEFromText(sourceBoundText);
  const riskAnalysis = detectRiskSignals(sourceBoundText);
  const contradictions = detectContradictions(sourceBoundText);
  const knowledge = filterKnowledgeByPolicy(
    resolveAssistantKnowledge({
      intent,
      text: taskText,
      limitPerDomain: 4,
      includeReferences: intent === 'reference_help',
      includeMemory: false,
      stage,
      noteType,
    }),
  );

  return {
    mse,
    risk: riskAnalysis,
    contradictions,
    knowledge,
  };
}
