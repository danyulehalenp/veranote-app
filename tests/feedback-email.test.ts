import { afterEach, describe, expect, it } from 'vitest';
import { buildFeedbackNotificationSubject, buildFromAddress, isFeedbackEmailConfigured, sendFeedbackNotification } from '@/lib/beta/feedback-email';
import type { BetaFeedbackItem } from '@/types/beta-feedback';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('feedback email notifications', () => {
  it('formats Vera-gap subject lines so they stand out in the inbox', () => {
    const feedback: BetaFeedbackItem = {
      id: 'feedback_2',
      createdAt: '2026-04-20T00:00:00.000Z',
      pageContext: 'Vera assistant gap',
      category: 'feature-request',
      message: 'Vera could not answer this provider question: what is the icd 10 for recurrent severe mdd?',
      status: 'new',
      metadata: {
        source: 'vera-gap',
        gapType: 'coding-reference',
        originalQuestion: 'what is the icd 10 for recurrent severe mdd?',
      },
    };

    expect(buildFeedbackNotificationSubject(feedback)).toBe('[Veranote][Teach Vera][coding reference] what is the icd 10 for recurrent severe mdd?');
  });

  it('formats general beta feedback subject lines with the category', () => {
    const feedback: BetaFeedbackItem = {
      id: 'feedback_3',
      createdAt: '2026-04-20T00:00:00.000Z',
      pageContext: 'Provider Workspace',
      category: 'workflow',
      message: 'Make the review warnings easier to scan.',
      status: 'new',
      metadata: {
        source: 'manual',
      },
    };

    expect(buildFeedbackNotificationSubject(feedback)).toBe('[Veranote][Beta Feedback][workflow] Make the review warnings easier to scan.');
  });

  it('builds a branded default from address', () => {
    expect(buildFromAddress(undefined, 'Veranote Feedback Bot', 'daniel@veranote.org')).toBe('"Veranote Feedback Bot" <daniel@veranote.org>');
  });

  it('stays non-blocking when SMTP is not configured', async () => {
    delete process.env.FEEDBACK_SMTP_HOST;
    delete process.env.FEEDBACK_SMTP_USER;
    delete process.env.FEEDBACK_SMTP_PASS;

    const feedback: BetaFeedbackItem = {
      id: 'feedback_1',
      createdAt: '2026-04-20T00:00:00.000Z',
      pageContext: 'Feedback Inbox',
      category: 'feature-request',
      message: 'Teach Vera more clinical questions.',
      status: 'new',
      metadata: {
        source: 'vera-gap',
        originalQuestion: 'How do I code this?',
      },
    };

    expect(isFeedbackEmailConfigured()).toBe(false);
    await expect(sendFeedbackNotification(feedback)).resolves.toEqual({
      configured: false,
      delivered: false,
    });
  });
});
