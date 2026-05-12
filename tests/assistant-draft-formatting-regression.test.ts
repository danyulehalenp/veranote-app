import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'assistant-draft-formatting-provider',
      role: 'provider',
      email: 'assistant-draft-formatting@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'assistant-draft-formatting-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

const messyDraft = [
  'HPI:',
  'Patient reports panic is less intense but still leaves the grocery store when it becomes crowded. Patient reports sleep of about 5 hours and forgot escitalopram twice this week.',
  '',
  'Mental Status Exam:',
  'Casually dressed, cooperative, speech normal rate, mood stressed, affect anxious, thought process goal directed, no psychosis observed.',
  '',
  'Assessment:',
  'Anxiety symptoms appear partially improved, with ongoing avoidance and medication adherence concerns.',
  '',
  'Plan:',
  'Therapy referral is being considered. No final medication change is documented in the visible draft.',
].join('\n');

type AssistantRoutePayload = {
  message: string;
  answerMode?: string;
  builderFamily?: string;
  suggestions?: string[];
  actions?: Array<{
    type?: string;
    label?: string;
    draftText?: string;
    rewriteLabel?: string;
  }>;
};

async function askFormatting(message: string) {
  const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message,
      context: {
        providerAddressingName: 'Test Provider',
        noteType: 'Outpatient Psych Follow-Up',
        outputDestination: 'Tebra/Kareo',
        currentDraftText: messyDraft,
      },
      recentMessages: [],
    }),
  }));

  expect(response.status).toBe(200);
  return response.json() as Promise<AssistantRoutePayload>;
}

describe('assistant draft formatting regression', () => {
  it('turns a sectioned draft into one paragraph even when the provider misspells paragraph', async () => {
    const payload = await askFormatting('for follow up note instead of sections make it into one paragraf');

    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.builderFamily).toBe('chart-wording');
    expect(payload.message).toMatch(/one-paragraph format/i);
    expect(payload.message).toMatch(/panic is less intense/i);
    expect(payload.message).toMatch(/forgot escitalopram twice/i);
    expect(payload.message).toMatch(/therapy referral is being considered/i);
    expect(payload.message).not.toMatch(/\n\nMental Status Exam:/);
    expect(payload.message).not.toMatch(/What should I focus on|How should I move through/i);

    const action = payload.actions?.find((item) => item.type === 'apply-draft-rewrite');
    expect(action?.draftText).toMatch(/HPI: Patient reports panic/i);
    expect(action?.draftText).not.toMatch(/\n\nPlan:/);
    expect(action?.rewriteLabel).toMatch(/one-paragraph/i);
  });

  it('formats HPI first and MSE/Plan second even with misspelled provider wording', async () => {
    const payload = await askFormatting('put HPI in frist paragraf and MSE and pln in secnd paragraf');

    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toMatch(/two-paragraph HPI\/MSE\/Plan format/i);
    expect(payload.message).toMatch(/HPI:/);
    expect(payload.message).toMatch(/Mental Status Exam:/);
    expect(payload.message).toMatch(/Plan:/);

    const action = payload.actions?.find((item) => item.type === 'apply-draft-rewrite');
    const draftText = action?.draftText || '';
    expect(draftText.split(/\n\n/).length).toBeGreaterThanOrEqual(2);
    expect(draftText.split(/\n\n/)[0]).toMatch(/HPI:/);
    expect(draftText.split(/\n\n/)[1]).toMatch(/Mental Status Exam:|Plan:/);
  });

  it('shortens a visible draft while preserving medication, symptom, and plan signal', async () => {
    const payload = await askFormatting('make this shorter and more concice but keep what matters');

    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toMatch(/shorter concise format/i);

    const action = payload.actions?.find((item) => item.type === 'apply-draft-rewrite');
    const draftText = action?.draftText || '';
    expect(draftText.length).toBeLessThan(messyDraft.length);
    expect(draftText).toMatch(/forgot escitalopram twice/i);
    expect(draftText).toMatch(/panic is less intense|ongoing avoidance/i);
    expect(draftText).toMatch(/therapy referral (is being )?considered/i);
    expect(draftText).not.toMatch(/What should I focus on|How should I move through/i);
  });

  it('turns a sectioned draft into story-flow narrative without adding unsupported facts', async () => {
    const payload = await askFormatting('make it flow like a story');

    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toMatch(/narrative story-flow format/i);

    const action = payload.actions?.find((item) => item.type === 'apply-draft-rewrite');
    const draftText = action?.draftText || '';
    expect(draftText).toMatch(/panic is less intense/i);
    expect(draftText).toMatch(/forgot escitalopram twice/i);
    expect(draftText).toMatch(/no final medication change is documented/i);
    expect(draftText).not.toMatch(/^HPI:/m);
    expect(draftText).not.toMatch(/unsupported|invented/i);
  });

  it('treats a direct draft-shaping follow-up as a rewrite even when the provider does not say draft', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'make it one paragraph',
        context: {
          providerAddressingName: 'Test Provider',
          noteType: 'Outpatient Psych Follow-Up',
          outputDestination: 'Tebra/Kareo',
          currentDraftText: messyDraft,
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'For this follow-up note, can you make the draft cleaner?',
          },
        ],
      }),
    }));

    expect(response.status).toBe(200);
    const payload = await response.json() as AssistantRoutePayload;
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.actions?.some((item) => item.type === 'apply-draft-rewrite')).toBe(true);
  });

  it('does not treat a new reference question as a draft rewrite just because a draft is visible', async () => {
    const payload = await askFormatting('what is schizoaffective disorder criteria?');

    expect(payload.answerMode).toBe('direct_reference_answer');
    expect(payload.message).toMatch(/schizoaffective/i);
    expect(payload.message).toMatch(/psychosis/i);
    expect(payload.message).not.toMatch(/Chart-ready wording/i);
    expect(payload.actions?.some((item) => item.type === 'apply-draft-rewrite')).not.toBe(true);
  });

  it('topic-switches to a misspelled medication reference question instead of rewriting the draft', async () => {
    const payload = await askFormatting('can lamictle cause a rash?');

    expect(payload.answerMode).toMatch(/reference|medication/i);
    expect(payload.message).toMatch(/Lamictal|lamotrigine|rash/i);
    expect(payload.actions?.some((item) => item.type === 'apply-draft-rewrite')).not.toBe(true);
  });
});
