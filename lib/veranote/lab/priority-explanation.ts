import type {
  VeraLabAssignedLayer,
  VeraLabFailureCategory,
  VeraLabPriorityBand,
  VeraLabPriorityExplanation,
  VeraLabSeverity,
} from '@/lib/veranote/lab/types';

export function buildPriorityExplanation(input: {
  total_score: number;
  band: VeraLabPriorityBand;
  factors: VeraLabPriorityExplanation['factors'];
  severity: VeraLabSeverity;
  similarFailureCount: number;
  regressionFailures: number;
  assignedLayer: VeraLabAssignedLayer;
  failureCategory: VeraLabFailureCategory | null;
}) {
  const rationale: string[] = [
    `${input.severity} clinical severity contributes ${input.factors.severity} points.`,
    input.similarFailureCount
      ? `${input.similarFailureCount} nearby similar failures contribute ${input.factors.frequency} points.`
      : `No nearby similar failures were found, so frequency contributes ${input.factors.frequency} points.`,
    input.regressionFailures
      ? `${input.regressionFailures} failing regression variants contribute ${input.factors.regression_risk} points of regression risk.`
      : `No failing regression variants were recorded, so regression risk contributes ${input.factors.regression_risk} points.`,
    `${input.assignedLayer} carries ${input.factors.layer_weight} points because that layer can affect multiple prompts at once.`,
    `${input.failureCategory || 'unclassified failure'} contributes ${input.factors.failure_category} points.`,
    `This yields a total priority score of ${input.total_score}, which falls in the ${input.band} band.`,
  ];

  return {
    total_score: input.total_score,
    band: input.band,
    factors: input.factors,
    rationale,
  } satisfies VeraLabPriorityExplanation;
}
