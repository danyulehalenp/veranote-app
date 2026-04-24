import { computeFixPriority } from '@/lib/veranote/lab/fix-priority';
import { getSuggestedFixStrategy } from '@/lib/veranote/lab/fix-strategy';
import type {
  VeraLabImprovementPlan,
  VeraLabJudgedCaseResult,
  VeraLabRepairTaskDraft,
  VeraProviderQuestionCase,
} from '@/lib/veranote/lab/types';

function buildRegressionPlan(caseDefinition: VeraProviderQuestionCase, similarFailures: Array<{ id: string }>, regressionHistory: Array<{ prompt_variant: string; passed: boolean }>) {
  const lines = [
    `Retest the original prompt: "${caseDefinition.prompt}"`,
  ];

  if (caseDefinition.followup_prompt) {
    lines.push(`Retest the follow-up prompt: "${caseDefinition.followup_prompt}"`);
  }

  if (caseDefinition.turns?.length) {
    lines.push(`Retest ${caseDefinition.turns.length} scripted turn variants from the same case.`);
  }

  if (similarFailures.length) {
    lines.push(`Include ${Math.min(similarFailures.length, 3)} nearby similar failures to confirm one fix covers the cluster.`);
  }

  if (regressionHistory.some((item) => !item.passed)) {
    lines.push('Re-run previously failed regression variants before approving any patch.');
  } else {
    lines.push('Run adjacent same-subtype and same-category prompts to confirm no new routing or wording drift.');
  }

  return lines.join('\n');
}

export function buildImprovementPlan(input: {
  caseDefinition: VeraProviderQuestionCase;
  judged: VeraLabJudgedCaseResult;
  assignedLayer: VeraLabRepairTaskDraft['assigned_layer'];
  expectedAnswerShape: string;
  proposedPatchPrompt: string;
  similarFailures: Array<{ id: string; prompt: string; failure_category: string | null; judge_notes: string | null }>;
  regressionHistory: Array<{ prompt_variant: string; passed: boolean; notes?: string | null }>;
}): VeraLabImprovementPlan {
  const priority = computeFixPriority({
    severity: input.caseDefinition.severity_if_wrong,
    similarFailureCount: input.similarFailures.length,
    regressionHistory: input.regressionHistory,
    assignedLayer: input.assignedLayer,
    failureCategory: input.judged.failure_category,
  });

  const strategy = getSuggestedFixStrategy(input.assignedLayer);
  const regression_plan = buildRegressionPlan(input.caseDefinition, input.similarFailures, input.regressionHistory);

  const summary = [
    `Fix ${input.caseDefinition.category}/${input.caseDefinition.subtype} in the ${input.assignedLayer} layer.`,
    `Current failure: ${input.judged.failure_category || 'unclassified'} with ${input.caseDefinition.severity_if_wrong} clinical impact.`,
    `Expected answer shape: ${input.expectedAnswerShape}`,
    input.similarFailures.length
      ? `This failure clusters with ${input.similarFailures.length} nearby similar failures.`
      : 'No nearby similar failures were found for this exact subtype yet.',
  ].join(' ');

  return {
    summary,
    priority_score: priority.priority_score,
    priority_band: priority.priority_band,
    priority_explanation: priority.priority_explanation,
    assigned_layer: input.assignedLayer,
    suggested_fix_strategy: strategy,
    proposed_patch_prompt: input.proposedPatchPrompt,
    regression_plan,
    approval_required: true,
  };
}
