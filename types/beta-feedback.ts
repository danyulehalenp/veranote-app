export type BetaFeedbackCategory =
  | 'workflow'
  | 'navigation'
  | 'feature-request'
  | 'bug'
  | 'general';

export type BetaFeedbackStatus = 'new' | 'planned' | 'taught';

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
};

export type BetaFeedbackItem = {
  id: string;
  createdAt: string;
  pageContext: string;
  category: BetaFeedbackCategory;
  message: string;
  status: BetaFeedbackStatus;
  metadata?: BetaFeedbackMetadata;
};
