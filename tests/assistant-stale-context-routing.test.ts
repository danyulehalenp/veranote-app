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

  it('formats the active draft into one paragraph instead of reusing stale MSE checklist context', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'For follow up note, instead of sections, make it into one paragraph.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Follow Up Note',
          focusedSectionHeading: 'MSE',
          currentDraftText: [
            'Subjective:',
            'Patient reports mood is depressed and sleep remains poor. Patient denies current intent.',
            '',
            'Objective:',
            'Patient was observed withdrawn on the unit.',
            '',
            'Assessment:',
            'Depressive symptoms remain active with ongoing monitoring needs.',
            '',
            'Plan:',
            'Continue current safety monitoring and reassess after collateral is reviewed.',
          ].join('\n'),
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'The source only supports mood depressed, hopelessness, SI, and poor insight. What MSE domains should remain unfilled?',
          },
          {
            role: 'assistant',
            content: 'Source-supported MSE findings remain limited. Leave missing domains unfilled.',
            answerMode: 'mse_completion_limits',
            builderFamily: 'mse',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.builderFamily).toBe('chart-wording');
    expect(payload.message).toContain('one-paragraph format');
    expect(payload.message).toContain('Subjective: Patient reports mood is depressed');
    expect(payload.message).toContain('Objective: Patient was observed withdrawn');
    expect(payload.message).toContain('Plan: Continue current safety monitoring');
    expect(payload.message).not.toContain('Source-supported MSE findings');
    expect(payload.message).not.toContain('Leave these domains unfilled');
    expect(payload.actions?.[0]?.type).toBe('apply-draft-rewrite');
    expect(payload.actions?.[0]?.label).toBe('Apply to Draft');
    expect(payload.actions?.[0]?.draftText).toContain('Subjective: Patient reports mood is depressed');
    expect(payload.actions?.[0]?.rewriteLabel).toBe('one-paragraph format');
  });

  it('supports two-paragraph HPI plus MSE/plan draft shape requests', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make HPI in first paragraph and MSE and plan in second paragraph.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports anxiety improved since last visit but sleep remains fragmented.',
            '',
            'MSE:',
            'Mood anxious, affect congruent, thought process linear.',
            '',
            'Plan:',
            'Continue current therapy plan and follow up as scheduled.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('two-paragraph HPI/MSE/Plan format');
    expect(payload.message).toContain('HPI: Patient reports anxiety improved');
    expect(payload.message).toContain('\n\nMSE: Mood anxious');
    expect(payload.message).toContain('Plan: Continue current therapy plan');
    expect(payload.message).not.toContain('Source-supported MSE findings');
    expect(payload.actions?.[0]?.type).toBe('apply-draft-rewrite');
    expect(payload.actions?.[0]?.draftText).toContain('\n\nMSE: Mood anxious');
    expect(payload.actions?.[0]?.rewriteLabel).toBe('two-paragraph HPI/MSE/Plan format');
  });

  it('formats the active draft for EHR copy-paste without hijacking clinical routing', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make this draft EHR-ready for WellSky copy paste.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Follow Up Note',
          outputDestination: 'WellSky',
          currentDraftText: [
            'HPI:',
            'Patient reports sleep remains poor and mood is depressed.',
            '',
            'MSE:',
            '- Affect constricted.',
            '- Thought process linear.',
            '',
            'Plan:',
            'Continue source-supported monitoring plan.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('EHR-ready copy/paste format');
    expect(payload.actions?.[0]?.type).toBe('apply-draft-rewrite');
    expect(payload.actions?.[0]?.draftText).toContain('HPI:\nPatient reports sleep remains poor');
    expect(payload.actions?.[0]?.draftText).toContain('MSE:\nAffect constricted.');
    expect(payload.actions?.[0]?.draftText).not.toContain('•');
  });

  it('recognizes fast-typed misspelled draft shape requests', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'make this draft shoter and more concice',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports partial improvement in mood with persistent sleep disruption.',
            '',
            'MSE:',
            'Affect constricted and thought process linear.',
            '',
            'Plan:',
            'Continue source-supported follow-up plan.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('shorter concise format');
    expect(payload.actions?.[0]?.type).toBe('apply-draft-rewrite');
    expect(payload.actions?.[0]?.rewriteLabel).toBe('shorter concise format');
    expect(payload.message).not.toContain('I do not have a safe Veranote answer');
  });
});
