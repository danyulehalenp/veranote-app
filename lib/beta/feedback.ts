import { z } from 'zod';
import { betaIssueCategories, betaOutreachStatuses, betaCohortSlots, supportedBetaWorkflows } from '@/lib/constants/provider-beta';

export const betaFeedbackEntrySchema = z.object({
  providerRole: z.string().trim().min(1),
  careSetting: z.string().trim().min(1),
  noteType: z.string().trim().min(1),
  sourceInputShape: z.string().trim().min(1),
  usefulness: z.number().int().min(1).max(5),
  trust: z.number().int().min(1).max(5),
  reviewBurden: z.number().int().min(1).max(5),
  likelihoodOfReuse: z.number().int().min(1).max(5),
  strongestPositiveSignal: z.string().trim().min(1),
  strongestConcern: z.string().trim().min(1),
  issueCategories: z.array(z.enum(betaIssueCategories)).default([]),
});

export const betaIssueLogEntrySchema = z.object({
  provider: z.string().trim().min(1),
  noteType: z.string().trim().min(1),
  issueCategory: z.enum(betaIssueCategories),
  severity: z.enum(['low', 'medium', 'high', 'beta-blocker']),
  summary: z.string().trim().min(1),
  repeatSignal: z.enum(['first occurrence', 'repeated', 'repeated across multiple providers']),
});

export const betaOutreachEntrySchema = z.object({
  slotId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  setting: z.string().trim().min(1),
  status: z.enum(betaOutreachStatuses),
  primaryWorkflow: z.string().trim().min(1),
});

export type BetaFeedbackEntry = z.infer<typeof betaFeedbackEntrySchema>;
export type BetaIssueLogEntry = z.infer<typeof betaIssueLogEntrySchema>;
export type BetaOutreachEntry = z.infer<typeof betaOutreachEntrySchema>;

export function summarizeBetaFeedbackReadiness() {
  return {
    supportedWorkflowCount: supportedBetaWorkflows.length,
    cohortSlotCount: betaCohortSlots.length,
    feedbackCategoryCount: betaIssueCategories.length,
    outreachStatusCount: betaOutreachStatuses.length,
  };
}
