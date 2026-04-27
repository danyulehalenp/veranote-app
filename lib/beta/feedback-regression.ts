import type { BetaFeedbackItem } from '@/types/beta-feedback';

export type FeedbackRegressionScaffold = {
  source: 'beta_feedback';
  feedback_id: string;
  workflow_area: string;
  note_type: string | null;
  failure_category: string;
  prompt_pattern: string;
  expected_behavior: string;
  must_include: string[];
  must_not_include: string[];
  expected_answer_mode: string | null;
  severity_if_wrong: string;
  notes: string;
};

function inferFailureCategory(feedback: BetaFeedbackItem) {
  switch (feedback.feedbackLabel) {
    case 'clinically-wrong':
      return 'clinical_wrongness';
    case 'missing-key-fact':
      return 'missing_key_fact';
    case 'too-generic':
      return 'generic_output';
    case 'too-long':
      return 'verbosity';
    case 'invented-something':
      return 'hallucination';
    case 'unsafe-wording':
      return 'unsafe_wording';
    case 'needs-work':
      return 'needs_refinement';
    case 'helpful':
      return 'positive_signal';
    default:
      return 'beta_feedback';
  }
}

export function buildFeedbackRegressionScaffold(feedback: BetaFeedbackItem): FeedbackRegressionScaffold {
  return {
    source: 'beta_feedback',
    feedback_id: feedback.id,
    workflow_area: feedback.workflowArea || feedback.metadata?.workflowArea || 'unknown',
    note_type: feedback.noteType || feedback.metadata?.noteType || null,
    failure_category: inferFailureCategory(feedback),
    prompt_pattern: feedback.promptSummary || feedback.metadata?.promptSummary || 'Add a sanitized beta-feedback prompt pattern here.',
    expected_behavior: feedback.desiredBehavior || feedback.userComment || 'Add the source-faithful expected behavior here before turning this into a regression case.',
    must_include: [],
    must_not_include: [],
    expected_answer_mode: feedback.answerMode || feedback.metadata?.answerMode || null,
    severity_if_wrong: feedback.severity || feedback.metadata?.severity || 'medium',
    notes: `Feedback label: ${feedback.feedbackLabel || feedback.metadata?.feedbackLabel || 'unspecified'}. Review the sanitized response summary before manually approving this as an Atlas Lab regression.`,
  };
}
