'use client';

import { useState } from 'react';
import type { BetaFeedbackCategory, BetaFeedbackItem } from '@/types/beta-feedback';
import type { FeedbackNotificationResult } from '@/lib/beta/feedback-email';

const categoryOptions: { value: BetaFeedbackCategory; label: string }[] = [
  { value: 'workflow', label: 'Workflow issue' },
  { value: 'navigation', label: 'Hard to find' },
  { value: 'feature-request', label: 'Need this added' },
  { value: 'bug', label: 'Error / bug' },
  { value: 'general', label: 'General feedback' },
];

type BetaFeedbackPanelProps = {
  pageContext: string;
};

export function BetaFeedbackPanel({ pageContext }: BetaFeedbackPanelProps) {
  const [category, setCategory] = useState<BetaFeedbackCategory>('workflow');
  const [message, setMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!message.trim()) {
      setError('Please add a quick note before submitting feedback.');
      return;
    }

    setIsSaving(true);
    setError('');
    setStatusMessage('');

    try {
      const response = await fetch('/api/beta-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageContext,
          category,
          message,
        } satisfies Partial<BetaFeedbackItem>),
      });

      const data = (await response.json()) as {
        feedback?: BetaFeedbackItem;
        error?: string;
        notification?: FeedbackNotificationResult;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Unable to save feedback right now.');
      }

      setMessage('');
      if (data.notification?.delivered && data.notification.recipient) {
        setStatusMessage(`Feedback saved and emailed to ${data.notification.recipient}. It also remains in the feedback inbox.`);
      } else {
        setStatusMessage('Feedback saved. The beta team can review it from the feedback inbox.');
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to save feedback right now.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section id="beta-feedback" className="aurora-panel rounded-[28px] p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Beta feedback</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">Tell us what is slowing you down</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/88">
            Use this when something feels hard to find, hard to trust, visually unclear, or simply in the wrong place.
            Immediate notes like “I don&apos;t like the way this reads” or “I need this easier to reach” are useful.
          </p>
        </div>
        <div className="aurora-pill rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">
          {pageContext}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCategory(option.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                category === option.value
                  ? 'border-cyan-200/30 bg-[rgba(18,181,208,0.18)] text-cyan-50'
                  : 'border-cyan-200/10 bg-[rgba(13,30,50,0.68)] text-ink hover:border-cyan-200/20 hover:bg-[rgba(18,181,208,0.12)] hover:text-cyan-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="grid gap-2 text-sm font-medium text-ink">
          <span>What should we change or fix?</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Example: I need the review warnings easier to scan, or the workspace buttons should stay visible without scrolling back up."
            className="min-h-[140px] rounded-[18px] border border-border bg-white p-4 text-sm text-slate-900"
          />
        </label>

        {error ? <div className="rounded-xl border border-rose-200/30 bg-[rgba(127,29,29,0.22)] px-4 py-3 text-sm text-rose-100">{error}</div> : null}
        {statusMessage ? <div className="rounded-xl border border-emerald-200/30 bg-[rgba(5,46,22,0.28)] px-4 py-3 text-sm text-emerald-100">{statusMessage}</div> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isSaving}
            className="aurora-primary-button rounded-xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving feedback...' : 'Save beta feedback'}
          </button>
          <p className="text-sm text-cyan-50/76">Saved feedback can be reviewed daily from the internal feedback inbox.</p>
        </div>
      </form>
    </section>
  );
}
