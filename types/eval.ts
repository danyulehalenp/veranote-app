export type EvalCaseSelection = {
  id: string;
  specialty: string;
  noteType: string;
  title: string;
  sourceInput: string;
};

export type EvalRubricCategoryKey =
  | 'factGrounding'
  | 'medicationFidelity'
  | 'negationFidelity'
  | 'timelineFidelity'
  | 'attributionFidelity'
  | 'missingDataBehavior'
  | 'contradictionHandling'
  | 'templateUsefulness';

export type EvalRubricScores = Record<EvalRubricCategoryKey, 0 | 1 | 2>;

export type EvalScorecard = {
  stoplight: 'Green' | 'Yellow' | 'Red';
  overallRating: 'Pass' | 'Needs revision' | 'Fail';
  regressionRunLabel: string;
  reviewedAt?: string;
  rubricScores: EvalRubricScores;
  criticalFailures: string[];
  notes: string;
  failuresFound: string;
  unsupportedTextExample: string;
  recommendedFix: string;
  outputSnapshot: string;
  outputFlagsSnapshot: string;
};
