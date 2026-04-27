export type BetaFeedbackCategory =
  | 'workflow'
  | 'navigation'
  | 'feature-request'
  | 'bug'
  | 'general';

export type BetaFeedbackLabel =
  | 'helpful'
  | 'needs-work'
  | 'clinically-wrong'
  | 'missing-key-fact'
  | 'too-generic'
  | 'too-long'
  | 'invented-something'
  | 'unsafe-wording'
  | 'other';

export type BetaFeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';

export type BetaFeedbackWorkflowArea =
  | 'note_builder'
  | 'vera_assistant'
  | 'medication_reference'
  | 'switching_framework';

export type BetaFeedbackStatus =
  | 'new'
  | 'reviewed'
  | 'needs_regression'
  | 'converted'
  | 'dismissed'
  | 'planned'
  | 'taught';

export type VeraGapType =
  | 'knowledge'
  | 'workflow'
  | 'drafting'
  | 'revision'
  | 'coding-reference';

export type BetaFeedbackMetadata = {
  source?: 'manual' | 'vera-gap';
  gapType?: VeraGapType;
  providerId?: string;
  providerProfileId?: string;
  providerProfileName?: string;
  providerAddressingName?: string;
  noteType?: string;
  stage?: 'compose' | 'review';
  originalQuestion?: string;
  assistantReply?: string;
  workflowArea?: BetaFeedbackWorkflowArea;
  feedbackLabel?: BetaFeedbackLabel;
  severity?: BetaFeedbackSeverity;
  answerMode?: string;
  builderFamily?: string;
  routeTaken?: string;
  model?: string;
  promptSummary?: string;
  responseSummary?: string;
  userComment?: string;
  desiredBehavior?: string;
  phiRiskFlag?: boolean;
  adminNotes?: string;
  convertedToRegression?: boolean;
  regressionCaseId?: string;
};

export type BetaFeedbackItem = {
  id: string;
  createdAt: string;
  pageContext: string;
  category: BetaFeedbackCategory;
  message: string;
  status: BetaFeedbackStatus;
  workflowArea?: BetaFeedbackWorkflowArea;
  noteType?: string;
  feedbackLabel?: BetaFeedbackLabel;
  severity?: BetaFeedbackSeverity;
  answerMode?: string;
  builderFamily?: string;
  routeTaken?: string;
  model?: string;
  promptSummary?: string;
  responseSummary?: string;
  userComment?: string;
  desiredBehavior?: string;
  phiRiskFlag?: boolean;
  adminNotes?: string;
  convertedToRegression?: boolean;
  regressionCaseId?: string;
  metadata?: BetaFeedbackMetadata;
};
