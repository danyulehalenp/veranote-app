'use client';

import { useState } from 'react';
import type { BetaFeedbackItem, BetaFeedbackLabel, BetaFeedbackWorkflowArea } from '@/types/beta-feedback';

const feedbackOptions: Array<{ value: BetaFeedbackLabel; label: string; negative?: boolean }> = [
  { value: 'helpful', label: 'Helpful' },
  { value: 'needs-work', label: 'Needs work', negative: true },
  { value: 'clinically-wrong', label: 'Clinically wrong', negative: true },
  { value: 'missing-key-fact', label: 'Missing key fact', negative: true },
  { value: 'too-generic', label: 'Too generic', negative: true },
  { value: 'too-long', label: 'Too long', negative: true },
  { value: 'invented-something', label: 'Invented something', negative: true },
  { value: 'unsafe-wording', label: 'Unsafe wording', negative: true },
  { value: 'other', label: 'Other', negative: true },
];

type InlineFeedbackControlProps = {
  pageContext: string;
  workflowArea: BetaFeedbackWorkflowArea;
  noteType?: string;
  answerMode?: string;
  builderFamily?: string;
  routeTaken?: string;
  model?: string;
  promptSummary?: string;
  responseSummary?: string;
  providerId?: string;
  providerProfileId?: string;
  providerProfileName?: string;
  providerAddressingName?: string;
  stage?: 'compose' | 'review';
  promptLabel?: string;
};

export function InlineFeedbackControl({
  pageContext,
  workflowArea,
  noteType,
  answerMode,
  builderFamily,
  routeTaken,
  model,
  promptSummary,
  responseSummary,
  providerId,
  providerProfileId,
  providerProfileName,
  providerAddressingName,
  stage,
  promptLabel = 'Was this useful?',
}: InlineFeedbackControlProps) {
  const [selected, setSelected] = useState<BetaFeedbackLabel | null>(null);
  const [userComment, setUserComment] = useState('');
  const [desiredBehavior, setDesiredBehavior] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedOption = feedbackOptions.find((option) => option.value === selected);
  const isNegative = Boolean(selectedOption?.negative);

  async function submit(label: BetaFeedbackLabel, extras?: { userComment?: string; desiredBehavior?: string }) {
    setIsSaving(true);
    setError('');
    setStatus('');

    try {
      const response = await fetch('/api/beta-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageContext,
          workflowArea,
          noteType,
          feedbackLabel: label,
          answerMode,
          builderFamily,
          routeTaken,
          model,
          promptSummary,
          responseSummary,
          userComment: extras?.userComment,
          desiredBehavior: extras?.desiredBehavior,
          metadata: {
            source: 'manual',
            providerId,
            providerProfileId,
            providerProfileName,
            providerAddressingName,
            noteType,
            stage,
          },
        } satisfies Partial<BetaFeedbackItem>),
      });

      const data = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Unable to save feedback right now.');
      }

      setStatus('Thanks — this helps improve Atlas.');
      setSelected(null);
      setUserComment('');
      setDesiredBehavior('');
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to save feedback right now.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-3 rounded-[16px] border border-cyan-200/10 bg-[rgba(8,24,40,0.58)] px-3 py-3 text-xs text-cyan-50/78">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">{promptLabel}</div>
          <div className="mt-1 text-[11px] text-cyan-50/62">
            Please avoid names, DOBs, MRNs, or other identifiers in feedback.
          </div>
        </div>
        {status ? <div className="text-[11px] text-emerald-100/88">{status}</div> : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {feedbackOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              if (!option.negative) {
                void submit(option.value);
                return;
              }

              setSelected(option.value);
              setStatus('');
            }}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              selected === option.value
                ? 'border-cyan-200/24 bg-[rgba(18,181,208,0.18)] text-cyan-50'
                : 'border-cyan-200/10 bg-[rgba(13,30,50,0.68)] text-cyan-50/80 hover:border-cyan-200/18 hover:text-cyan-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isNegative ? (
        <div className="mt-3 grid gap-3 rounded-[14px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-3">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium text-cyan-50/80">What was wrong? Optional.</span>
            <textarea
              value={userComment}
              onChange={(event) => setUserComment(event.target.value)}
              className="min-h-[76px] rounded-[12px] border border-cyan-200/12 bg-[rgba(6,15,27,0.76)] px-3 py-2 text-xs text-cyan-50"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium text-cyan-50/80">What should Atlas have done? Optional.</span>
            <textarea
              value={desiredBehavior}
              onChange={(event) => setDesiredBehavior(event.target.value)}
              className="min-h-[76px] rounded-[12px] border border-cyan-200/12 bg-[rgba(6,15,27,0.76)] px-3 py-2 text-xs text-cyan-50"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selected ? void submit(selected, { userComment, desiredBehavior }) : undefined}
              disabled={isSaving}
              className="rounded-[12px] bg-accent px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Send feedback'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setUserComment('');
                setDesiredBehavior('');
              }}
              className="rounded-[12px] border border-cyan-200/14 bg-[rgba(8,27,44,0.9)] px-3 py-2 text-[11px] font-medium text-cyan-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-[12px] border border-rose-200/20 bg-[rgba(127,29,29,0.2)] px-3 py-2 text-[11px] text-rose-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}
