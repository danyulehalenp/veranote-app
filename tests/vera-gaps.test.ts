import { describe, expect, it } from 'vitest';
import { inferVeraGapType, summarizeVeraGaps } from '@/lib/beta/vera-gaps';
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
});
