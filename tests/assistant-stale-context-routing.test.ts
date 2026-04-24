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
    expect(payload.message).toContain('300 mg twice daily');
    expect(payload.message).toContain('I should verify this against a prescribing reference');
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
    expect(payload.answerMode).toBe('direct_reference_answer');
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
    expect(payload.message).toContain('orthostasis');
    expect(payload.message).toContain('bradycardia');
    expect(payload.message).not.toContain('300 mg twice daily');
  });
});
