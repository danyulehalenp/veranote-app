import { buildPriorityExplanation } from '@/lib/veranote/lab/priority-explanation';
import type {
  VeraLabAssignedLayer,
  VeraLabFailureCategory,
  VeraLabPriorityBand,
  VeraLabSeverity,
} from '@/lib/veranote/lab/types';

const severityWeights: Record<VeraLabSeverity, number> = {
  low: 1,
  medium: 2,
  high: 4,
  critical: 5,
};

const rootCauseWeights: Record<VeraLabAssignedLayer, number> = {
  routing: 3,
  'answer-mode': 2,
  'knowledge-layer': 3,
  wording: 1,
  'ui-workflow': 1,
};

const failureCategoryWeights: Record<VeraLabFailureCategory, number> = {
  routing_failure: 3,
  answer_mode_failure: 2,
  knowledge_failure: 3,
  wording_failure: 1,
  ui_workflow_issue: 1,
  fallback_generic_issue: 2,
};

function regressionRiskWeight(regressionHistory: Array<{ passed: boolean }>) {
  if (!regressionHistory.length) {
    return 1;
  }

  const failures = regressionHistory.filter((item) => !item.passed).length;
  return failures >= 3 ? 3 : failures >= 1 ? 2 : 1;
}

function frequencyWeight(similarFailureCount: number) {
  if (similarFailureCount >= 5) {
    return 4;
  }
  if (similarFailureCount >= 3) {
    return 3;
  }
  if (similarFailureCount >= 1) {
    return 2;
  }
  return 1;
}

export function computeFixPriority(input: {
  severity: VeraLabSeverity;
  similarFailureCount: number;
  regressionHistory: Array<{ passed: boolean }>;
  assignedLayer: VeraLabAssignedLayer;
  failureCategory: VeraLabFailureCategory | null;
}) {
  const severityWeight = severityWeights[input.severity] || 1;
  const frequency = frequencyWeight(input.similarFailureCount);
  const regressionRisk = regressionRiskWeight(input.regressionHistory);
  const layerWeight = rootCauseWeights[input.assignedLayer] || 1;
  const failureWeight = input.failureCategory ? failureCategoryWeights[input.failureCategory] || 1 : 1;

  const factors = {
    severity: severityWeight * 4,
    frequency: frequency * 3,
    regression_risk: regressionRisk * 3,
    layer_weight: layerWeight * 2,
    failure_category: failureWeight,
  };

  const priority_score = factors.severity + factors.frequency + factors.regression_risk + factors.layer_weight + factors.failure_category;

  let priority_band: VeraLabPriorityBand = 'low';
  if (priority_score >= 30) {
    priority_band = 'urgent';
  } else if (priority_score >= 22) {
    priority_band = 'high';
  } else if (priority_score >= 14) {
    priority_band = 'medium';
  }

  return {
    priority_score,
    priority_band,
    priority_explanation: buildPriorityExplanation({
      total_score: priority_score,
      band: priority_band,
      factors,
      severity: input.severity,
      similarFailureCount: input.similarFailureCount,
      regressionFailures: input.regressionHistory.filter((item) => !item.passed).length,
      assignedLayer: input.assignedLayer,
      failureCategory: input.failureCategory,
    }),
  };
}
