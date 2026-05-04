import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'stale-context-provider',
      role: 'provider',
      email: 'stale-context@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'stale-context-provider',
    tokenSource: 'header',
  }),
}));

import { POST } from '@/app/api/assistant/respond/route';

const staleEatingDisorderContext = {
  providerAddressingName: 'Daniel Hale',
  noteType: 'Inpatient Psych Progress Note',
  currentDraftText: 'Eating disorder involving restriction remains concerning because intake is poor, orthostasis is documented, and bradycardia is still present.',
};

const staleEatingDisorderMessages = [
  {
    role: 'provider',
    content: 'Source says eating disorder involving restriction, poor intake, orthostasis, and bradycardia. Keep the medical risk explicit in the note.',
  },
  {
    role: 'assistant',
    content: 'Keep eating-disorder medical risk explicit and do not smooth away orthostasis or bradycardia.',
  },
] as const;

describe('assistant stale-context routing', () => {
  it('does not reuse stale eating-disorder context for direct Trileptal dose questions', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'what is starting dose of Trileptal daily for an adult?',
        context: staleEatingDisorderContext,
        recentMessages: staleEatingDisorderMessages,
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('150-300 mg twice daily');
    expect(payload.message).toContain('Dosing depends on indication, patient factors, interactions, and current prescribing references.');
    expect(payload.message).not.toContain('Eating disorder involving restriction');
    expect(payload.message).not.toContain('orthostasis');
    expect(payload.answerMode).toBe('medication_reference_answer');
  });

  it('does not reuse stale eating-disorder context for adult sleep questions', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'How many hours of sleep is recommended for an adult?',
        context: staleEatingDisorderContext,
        recentMessages: staleEatingDisorderMessages,
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('at least 7 hours');
    expect(payload.message).not.toContain('Eating disorder involving restriction');
    expect(payload.message).not.toContain('bradycardia');
    expect(payload.answerMode).toBe('general_health_reference');
  });

  it('answers direct clinical abbreviation questions instead of reusing stale MSE context', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'What does MSE mean?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          focusedSectionHeading: 'MSE',
          currentDraftText: 'Source-supported MSE findings remain limited because the source only says anxious and late.',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'The source only says mood anxious and late. What should Atlas refuse to auto-complete in the MSE?',
          },
          {
            role: 'assistant',
            content: 'Source-supported MSE findings remain limited; do not invent normal domains.',
            answerMode: 'mse_completion_limits',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('MSE means Mental Status Exam');
    expect(payload.message).not.toContain('Source-supported MSE findings');
    expect(payload.message).not.toContain('refuse to auto-complete');
    expect(payload.answerMode).toBe('direct_reference_answer');
  });

  it('does not reuse stale eating-disorder context for antidepressant letter questions', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'What antidepressant generic starts with a d?',
        context: staleEatingDisorderContext,
        recentMessages: staleEatingDisorderMessages,
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('duloxetine');
    expect(payload.message).toContain('desvenlafaxine');
    expect(payload.message).toContain('doxepin');
    expect(payload.message).not.toContain('Eating disorder involving restriction');
    expect(payload.answerMode).toBe('medication_reference_answer');
  });

  it('still uses eating-disorder note context when the user explicitly references the current note', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'In this note, what should stay explicit about the eating-disorder medical risk?',
        context: staleEatingDisorderContext,
        recentMessages: staleEatingDisorderMessages,
      }),
    }));

    const payload = await response.json();
    expect(payload.message).toContain('medical risk');
    expect(payload.message).not.toContain('300 mg twice daily');
  });

  it('keeps note-grounded medication documentation prompts in clinical documentation mode', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'In this note how should I word the Abilify issue without turning it into an order?',
        context: staleEatingDisorderContext,
        recentMessages: staleEatingDisorderMessages,
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).not.toBe('medication_reference_answer');
    expect(payload.message).not.toContain('aripiprazole is an antipsychotic');
  });
});
