import { describe, expect, it } from 'vitest';
import { inferVeraGapType, summarizeBetaFeedbackQueue, summarizeVeraGaps } from '@/lib/beta/vera-gaps';
import type { BetaFeedbackItem } from '@/types/beta-feedback';

describe('vera gaps', () => {
  it('infers coding-reference gaps from coding questions', () => {
    expect(inferVeraGapType('Do you know the diagnosis ICD 10 for MDD?')).toBe('coding-reference');
  });

  it('groups repeated Vera gaps by original question', () => {
    const feedback: BetaFeedbackItem[] = [
      {
        id: '1',
        createdAt: '2026-04-19T10:00:00.000Z',
        pageContext: 'Vera assistant gap',
        category: 'feature-request',
        message: 'Vera could not answer this provider question: Do you know the diagnosis ICD 10 for MDD?',
        status: 'new',
        metadata: {
          source: 'vera-gap',
          gapType: 'coding-reference',
          originalQuestion: 'Do you know the diagnosis ICD 10 for MDD?',
        },
      },
      {
        id: '2',
        createdAt: '2026-04-19T12:00:00.000Z',
        pageContext: 'Vera assistant gap',
        category: 'feature-request',
        message: 'Vera could not answer this provider question: Do you know the diagnosis ICD 10 for MDD?',
        status: 'planned',
        metadata: {
          source: 'vera-gap',
          gapType: 'coding-reference',
          originalQuestion: 'Do you know the diagnosis ICD 10 for MDD?',
        },
      },
    ];

    const summaries = summarizeVeraGaps(feedback);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.count).toBe(2);
    expect(summaries[0]?.sample.status).toBe('planned');
  });

  it('summarizes the feedback queue for regular review surfaces', () => {
    const feedback: BetaFeedbackItem[] = [
      {
        id: '1',
        createdAt: '2026-04-19T10:00:00.000Z',
        pageContext: 'Vera assistant gap',
        category: 'feature-request',
        message: 'Missing coding answer',
        status: 'new',
        metadata: {
          source: 'vera-gap',
          gapType: 'coding-reference',
          originalQuestion: 'Do you know the diagnosis ICD 10 for MDD?',
        },
      },
      {
        id: '2',
        createdAt: '2026-04-19T12:00:00.000Z',
        pageContext: 'Workspace',
        category: 'workflow',
        message: 'Review page is hard to scan',
        status: 'new',
        metadata: {
          source: 'manual',
        },
      },
      {
        id: '3',
        createdAt: '2026-04-19T13:00:00.000Z',
        pageContext: 'Vera assistant gap',
        category: 'feature-request',
        message: 'Missing draft answer',
        status: 'planned',
        metadata: {
          source: 'vera-gap',
          gapType: 'drafting',
          originalQuestion: 'Can you draft the assessment?',
        },
      },
    ];

    expect(summarizeBetaFeedbackQueue(feedback)).toEqual({
      totalCount: 3,
      newCount: 2,
      veraGapCount: 2,
      newVeraGapCount: 1,
    });
  });
});
