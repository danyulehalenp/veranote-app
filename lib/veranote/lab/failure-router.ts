import { allVeraProviderQuestionCases } from '@/lib/veranote/lab/question-bank';
import { buildImprovementPlan } from '@/lib/veranote/lab/improvement-planner';
import type {
  VeraLabAssignedLayer,
  VeraLabJudgedCaseResult,
  VeraLabRegressionVariant,
  VeraLabRepairTaskDraft,
  VeraProviderQuestionCase,
} from '@/lib/veranote/lab/types';

function expectedAnswerShape(caseDefinition: VeraProviderQuestionCase) {
  if (caseDefinition.expected_answer_mode === 'chart_ready_wording') {
    return 'Return chart-ready wording with note-usable phrasing, preserve source fidelity, and keep contradictions visible.';
  }

  if (caseDefinition.category === 'practical_utility') {
    return 'Return a direct utility answer with no clinical drift or fallback framing.';
  }

  if (caseDefinition.category === 'mse_completion_limits') {
    return 'Preserve incomplete MSE domains and explicitly refuse unsupported auto-completion.';
  }

  if (caseDefinition.category === 'risk_contradiction') {
    return 'Keep higher-acuity facts, denial, uncertainty, and contradictions side by side without low-risk smoothing.';
  }

  return 'Return a source-bound, provider-usable answer in the correct lane with no fallback or cross-domain drift.';
}

export function buildRepairTaskDraft(
  caseDefinition: VeraProviderQuestionCase,
  judged: VeraLabJudgedCaseResult,
  similarFailures: Array<{ id: string; prompt: string; failure_category: string | null; judge_notes: string | null }>,
  regressionHistory: Array<{ prompt_variant: string; passed: boolean; notes?: string | null }> = [],
): VeraLabRepairTaskDraft {
  const expectedShape = expectedAnswerShape(caseDefinition);
  const similarFailureLines = similarFailures
    .map((item) => `- ${item.id}: ${item.prompt}`)
    .join('\n');
  const proposedPatchPrompt = [
    `Repair Vera failure in layer: ${judged.likely_root_cause}.`,
    `Original prompt: ${caseDefinition.prompt}`,
    `Vera output: ${judged.vera_response}`,
    `Failure category: ${judged.failure_category || 'unknown'}`,
    `Expected answer shape: ${expectedShape}`,
    `Judge notes: ${judged.judge_notes}`,
    similarFailureLines ? `Similar failures:\n${similarFailureLines}` : 'Similar failures: none nearby.',
    'Repair target: keep provider usefulness high, preserve clinical safety, and do not introduce cross-domain drift.',
  ].join('\n');

  const improvementPlan = buildImprovementPlan({
    caseDefinition,
    judged,
    assignedLayer: judged.likely_root_cause,
    expectedAnswerShape: expectedShape,
    proposedPatchPrompt,
    similarFailures,
    regressionHistory,
  });

  return {
    assigned_layer: judged.likely_root_cause,
    failure_category: judged.failure_category || 'wording_failure',
    expected_answer_shape: expectedShape,
    similar_failures: similarFailures.map((item) => item.id),
    patch_prompt: improvementPlan.proposed_patch_prompt,
    priority_score: improvementPlan.priority_score,
    priority_band: improvementPlan.priority_band,
    priority_explanation: improvementPlan.priority_explanation,
    suggested_fix_strategy: improvementPlan.suggested_fix_strategy,
    regression_plan: improvementPlan.regression_plan,
    approval_required: improvementPlan.approval_required,
    improvement_summary: improvementPlan.summary,
    status: 'proposed',
  };
}

export function buildRegressionVariants(
  caseDefinition: VeraProviderQuestionCase,
  previousPassingPrompts: string[] = [],
): VeraLabRegressionVariant[] {
  const siblingSameSubtype = allVeraProviderQuestionCases.find((item) => (
    item.id !== caseDefinition.id
    && item.category === caseDefinition.category
    && item.subtype === caseDefinition.subtype
  ));
  const siblingSameCategory = allVeraProviderQuestionCases.find((item) => (
    item.id !== caseDefinition.id
    && item.category === caseDefinition.category
  ));

  const variants: VeraLabRegressionVariant[] = [
    {
      prompt_variant: caseDefinition.prompt,
      notes: 'original failed prompt',
    },
  ];

  if (caseDefinition.followup_prompt) {
    variants.push({
      prompt_variant: caseDefinition.followup_prompt,
      notes: 'follow-up prompt',
    });
  }

  for (const turn of caseDefinition.turns || []) {
    variants.push({
      prompt_variant: turn.prompt,
      notes: `${turn.label} prompt`,
    });
  }

  if (siblingSameSubtype) {
    variants.push({
      prompt_variant: siblingSameSubtype.prompt,
      notes: 'adjacent same-subtype prompt',
    });
  }

  if (siblingSameCategory) {
    variants.push({
      prompt_variant: siblingSameCategory.prompt,
      notes: 'adjacent same-category prompt',
    });
  }

  for (const prompt of previousPassingPrompts.slice(0, 2)) {
    variants.push({
      prompt_variant: prompt,
      notes: 'previously passing prompt',
    });
  }

  const deduped = new Map<string, VeraLabRegressionVariant>();
  for (const variant of variants) {
    if (!deduped.has(variant.prompt_variant)) {
      deduped.set(variant.prompt_variant, variant);
    }
  }

  return [...deduped.values()].slice(0, 8);
}

export function mapFailureCategoryToLayer(category: string | null): VeraLabAssignedLayer {
  switch (category) {
    case 'routing_failure':
    case 'fallback_generic_issue':
      return 'routing';
    case 'answer_mode_failure':
      return 'answer-mode';
    case 'knowledge_failure':
      return 'knowledge-layer';
    case 'ui_workflow_issue':
      return 'ui-workflow';
    default:
      return 'wording';
  }
}
