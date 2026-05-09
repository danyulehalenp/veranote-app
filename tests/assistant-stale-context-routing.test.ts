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

  it('handles the plain provider command make the note into one paragraph', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'make the note into one paragraph',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports mood is improving but anxiety remains elevated at work.',
            '',
            'MSE:',
            'Mood anxious; thought process goal directed.',
            '',
            'Plan:',
            'Continue source-supported follow-up plan and review tolerability next visit.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.answerMode).toBe('chart_ready_wording');
    expect(payload.message).toContain('one-paragraph format');
    expect(payload.actions?.[0]?.type).toBe('apply-draft-rewrite');
    expect(payload.actions?.[0]?.draftText).toContain('HPI: Patient reports mood is improving');
    expect(payload.actions?.[0]?.draftText).toContain('MSE: Mood anxious');
    expect(payload.actions?.[0]?.draftText).toContain('Plan: Continue source-supported follow-up plan');
  });

  it('handles follow-up-note paragraph requests that say instead of sections', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'for follow up note, instead of sections, make it into one paragraph',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports anxiety remains present but is less severe than last visit.',
            '',
            'MSE:',
            'Mood anxious; thought process linear.',
            '',
            'Assessment:',
            'Symptoms remain partially improved.',
            '',
            'Plan:',
            'Continue source-supported treatment plan and follow up as scheduled.',
          ].join('\n'),
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'What MSE pieces are missing?',
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
    expect(payload.message).toContain('one-paragraph format');
    expect(payload.message).toContain('HPI: Patient reports anxiety remains present');
    expect(payload.message).toContain('MSE: Mood anxious');
    expect(payload.message).toContain('Plan: Continue source-supported treatment plan');
    expect(payload.message).not.toContain('Source-supported MSE findings');
    expect(payload.actions?.[0]?.type).toBe('apply-draft-rewrite');
    expect(payload.actions?.[0]?.draftText).not.toContain('\n\nMSE:');
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

  it('recognizes misspelled narrative draft-shaping requests as writing changes', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'make this follow up note flow like a narritive story',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'Subjective:',
            'Patient reports anxiety is partially improved but still avoids stores.',
            '',
            'Objective:',
            'Affect anxious and thought process goal directed.',
            '',
            'Plan:',
            'Continue source-supported follow-up plan.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('narrative story-flow format');
    expect(payload.actions?.[0]?.type).toBe('apply-draft-rewrite');
    expect(payload.actions?.[0]?.rewriteLabel).toBe('narrative story-flow format');
    expect(payload.message).not.toContain('I do not have a safe Veranote answer');
  });

  it('formats active draft into SOAP structure when requested', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Format this draft into SOAP format.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports anxiety is 30% improved but continues to avoid grocery stores.',
            '',
            'MSE:',
            'Mood anxious, affect congruent, thought process linear.',
            '',
            'Assessment:',
            'Anxiety symptoms remain partially improved with ongoing functional avoidance.',
            '',
            'Plan:',
            'Continue source-supported follow-up plan and review safety each visit.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('SOAP format');
    expect(payload.actions?.[0]?.type).toBe('apply-draft-rewrite');
    expect(payload.actions?.[0]?.draftText).toContain('Subjective:\nPatient reports anxiety');
    expect(payload.actions?.[0]?.draftText).toContain('Objective:\nMood anxious');
    expect(payload.actions?.[0]?.draftText).toContain('Assessment:\nAnxiety symptoms remain');
    expect(payload.actions?.[0]?.draftText).toContain('Plan:\nContinue source-supported follow-up plan');
  });

  it('keeps headings when provider asks for a concise sectioned draft', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make this draft breif and conscise but keep the headings.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports mood remains depressed with poor sleep.',
            '',
            'MSE:',
            'Affect constricted; thought content includes hopelessness without active intent stated.',
            '',
            'Plan:',
            'Continue source-supported monitoring and reassess after collateral review.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('concise sectioned format');
    expect(payload.actions?.[0]?.draftText).toContain('HPI:\nPatient reports mood remains depressed');
    expect(payload.actions?.[0]?.draftText).toContain('MSE:\nAffect constricted');
    expect(payload.actions?.[0]?.draftText).toContain('Plan:\nContinue source-supported monitoring');
    expect(payload.actions?.[0]?.rewriteLabel).toBe('concise sectioned format');
  });

  it('keeps all available section detail when provider asks for a longer draft', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make this draft longer and include more details.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports anxiety is 30% improved but continues to avoid grocery stores alone.',
            'Sleep improved from 4 hours to 6 hours nightly.',
            '',
            'MSE:',
            'Mood anxious, affect congruent, thought process linear.',
            '',
            'Assessment:',
            'Anxiety symptoms remain partially improved with persistent functional avoidance.',
            '',
            'Plan:',
            'Continue source-supported follow-up plan and review medication tolerability next visit.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('more detailed format');
    expect(payload.actions?.[0]?.type).toBe('apply-draft-rewrite');
    expect(payload.actions?.[0]?.draftText).toContain('HPI:\nPatient reports anxiety is 30% improved');
    expect(payload.actions?.[0]?.draftText).toContain('Sleep improved from 4 hours to 6 hours nightly.');
    expect(payload.actions?.[0]?.draftText).toContain('Assessment:\nAnxiety symptoms remain partially improved');
    expect(payload.actions?.[0]?.rewriteLabel).toBe('more detailed format');
    expect(payload.message).not.toContain('I do not have a safe Veranote answer');
  });

  it('preserves risk wording when shortening a draft', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'make it shorter and more concise but keep the risk wording',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports depression remains present but denies active suicidal intent or plan today.',
            '',
            'Risk:',
            'Passive death-wish language remains documented, and collateral review is still pending.',
            '',
            'Plan:',
            'Continue source-supported safety monitoring and reassess after collateral is reviewed.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('shorter concise format');
    expect(payload.actions?.[0]?.type).toBe('apply-draft-rewrite');
    expect(payload.actions?.[0]?.draftText).toMatch(/denies active suicidal intent or plan/i);
    expect(payload.actions?.[0]?.draftText).toMatch(/passive death-wish/i);
    expect(payload.actions?.[0]?.draftText).toMatch(/collateral review is still pending/i);
  });

  it('turns a draft into story flow without adding unsupported facts', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'make it flow like a story but do not add facts',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'Subjective:',
            'Patient reports anxiety is partially improved but still avoids grocery stores.',
            '',
            'Objective:',
            'Affect anxious; speech normal rate.',
            '',
            'Plan:',
            'Continue source-supported follow-up plan.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('narrative story-flow format');
    expect(payload.actions?.[0]?.type).toBe('apply-draft-rewrite');
    expect(payload.actions?.[0]?.draftText).toMatch(/anxiety is partially improved/i);
    expect(payload.actions?.[0]?.draftText).toMatch(/avoids grocery stores/i);
    expect(payload.actions?.[0]?.draftText).not.toMatch(/father|mother|new medication|dose increased/i);
  });

  it('switches focus from draft shaping to a new direct medication question', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'What is Lamictal used for?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports anxiety is partially improved.',
            '',
            'Plan:',
            'Continue source-supported follow-up plan.',
          ].join('\n'),
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Make this draft longer and include more details.',
          },
          {
            role: 'assistant',
            content: 'Yes. Here is the current note rewritten in more detailed format without adding new facts.',
            answerMode: 'chart_ready_wording',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('lamotrigine');
    expect(payload.message).not.toContain('more detailed format');
    expect(payload.message).not.toContain('HPI:');
    expect(payload.actions?.[0]?.type).not.toBe('apply-draft-rewrite');
  });

  it('switches focus from draft shaping to a new interaction question with misspellings', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'can welbutrin be taken with paxel?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports anxiety is partially improved.',
            '',
            'Plan:',
            'Continue source-supported follow-up plan.',
          ].join('\n'),
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Make the HPI first paragraph and MSE and plan second paragraph.',
          },
          {
            role: 'assistant',
            content: 'Here is the current note rewritten with HPI in the first paragraph and MSE/plan in the second paragraph.',
            answerMode: 'chart_ready_wording',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toMatch(/bupropion|Wellbutrin/i);
    expect(payload.message).toMatch(/paroxetine|Paxil|SSRI/i);
    expect(payload.message).not.toContain('HPI:');
    expect(payload.message).not.toContain('second paragraph');
    expect(payload.actions?.[0]?.type).not.toBe('apply-draft-rewrite');
  });

  it('switches focus from draft shaping to a new diagnostic criteria question and then elaborates', async () => {
    const diagnosticResponse = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'what is schizoaffective disorder criteria?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports anxiety is partially improved.',
            '',
            'Plan:',
            'Continue source-supported follow-up plan.',
          ].join('\n'),
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'Make this draft into one paragraph.',
          },
          {
            role: 'assistant',
            content: 'Yes. Here is the current note rewritten in one-paragraph format without adding new facts.',
            answerMode: 'chart_ready_wording',
            builderFamily: 'chart-wording',
          },
        ],
      }),
    }));

    const diagnosticPayload = await diagnosticResponse.json();
    expect(diagnosticPayload.answerMode).toBe('direct_reference_answer');
    expect(diagnosticPayload.message).toMatch(/schizoaffective/i);
    expect(diagnosticPayload.message).toMatch(/psychosis/i);
    expect(diagnosticPayload.message).toMatch(/mood/i);
    expect(diagnosticPayload.message).not.toContain('one-paragraph format');
    expect(diagnosticPayload.message).not.toContain('HPI:');
    expect(diagnosticPayload.actions?.[0]?.type).not.toBe('apply-draft-rewrite');

    const elaborationResponse = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'can you elaborate on this?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: 'HPI:\nPatient reports anxiety is partially improved.',
        },
        recentMessages: [
          {
            role: 'provider',
            content: 'what is schizoaffective disorder criteria?',
          },
          {
            role: 'assistant',
            content: diagnosticPayload.message,
            answerMode: diagnosticPayload.answerMode,
          },
        ],
      }),
    }));

    const elaborationPayload = await elaborationResponse.json();
    expect(elaborationPayload.answerMode).toBe('direct_reference_answer');
    expect(elaborationPayload.eval?.routePriority).toBe('atlas-conversation:diagnostic_reference');
    expect(elaborationPayload.eval?.conversation?.followupIntent).toBe('elaborate');
    expect(elaborationPayload.message).toMatch(/schizoaffective/i);
    expect(elaborationPayload.message).toMatch(/psychosis/i);
    expect(elaborationPayload.message).toMatch(/mood/i);
    expect(elaborationPayload.message).not.toContain("I don't have a safe Veranote answer");
    expect(elaborationPayload.message).not.toContain('one-paragraph format');
  });

  it('polishes casual draft wording into professional chart tone without adding facts', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make this sound more professional and less casual.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Pt says mood is kinda better but still wants dc.',
            '',
            'Safety:',
            'Denies si/hi today.',
            '',
            'Plan:',
            'Meds were discussed but final change not documented.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('professional chart tone');
    expect(payload.actions?.[0]?.draftText).toContain('Patient says mood is somewhat better');
    expect(payload.actions?.[0]?.draftText).toContain('still wants discharge');
    expect(payload.actions?.[0]?.draftText).toContain('Denies suicidal ideation/homicidal ideation today.');
    expect(payload.actions?.[0]?.draftText).not.toContain('stable for discharge');
    expect(payload.actions?.[0]?.rewriteLabel).toBe('professional chart tone');
  });

  it('supports conservative source-bound rewrite requests that remove unsupported certainty', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'Make this more conservative and remove unsupported statements.',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Discharge Summary',
          currentDraftText: [
            'Hospital Course:',
            'Pt improved and is stable for discharge.',
            '',
            'Risk:',
            'Denies si and is low risk.',
            '',
            'Plan:',
            'Follow-up not confirmed.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('source-bound conservative format');
    expect(payload.actions?.[0]?.draftText).toContain('discharge readiness not established');
    expect(payload.actions?.[0]?.draftText).toContain('risk level not established');
    expect(payload.actions?.[0]?.draftText).toContain('Follow-up not confirmed.');
    expect(payload.actions?.[0]?.draftText).not.toContain('stable for discharge');
    expect(payload.actions?.[0]?.draftText).not.toContain('low risk');
  });

  it('switches from draft-shaping context to a new misspelled medication interaction question', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'can welbutrin be taken with paxel?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports anxiety remains present.',
            '',
            'Plan:',
            'Continue source-supported follow-up plan.',
          ].join('\n'),
        },
        recentMessages: [
          { role: 'provider', content: 'make this draft shorter' },
          {
            role: 'assistant',
            content: 'Chart-ready wording: here is the current note rewritten in shorter concise format.',
            answerMode: 'chart_ready_wording',
          },
        ],
      }),
    }));

    const payload = await response.json();
    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toMatch(/bupropion|Wellbutrin/i);
    expect(payload.message).toMatch(/Paxil|paroxetine/i);
    expect(payload.message).not.toContain('shorter concise format');
    expect(payload.actions?.[0]?.type).not.toBe('apply-draft-rewrite');
  });

  it('recognizes typo-heavy two-paragraph draft shaping commands', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'put HPI in the frist para and MSE/pln in the secnd pargraph',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Outpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports anxiety is partially improved but sleep remains fragmented.',
            '',
            'MSE:',
            'Mood anxious and thought process goal directed.',
            '',
            'Plan:',
            'Continue source-supported follow-up plan.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('two-paragraph HPI/MSE/Plan format');
    expect(payload.actions?.[0]?.draftText).toContain('HPI: Patient reports anxiety');
    expect(payload.actions?.[0]?.draftText).toContain('\n\nMSE: Mood anxious');
    expect(payload.actions?.[0]?.draftText).toContain('Plan: Continue source-supported follow-up plan');
  });

  it('recognizes brief-with-headers wording as concise sectioned formatting', async () => {
    const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'make it briefer but keep headers',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Follow Up Note',
          currentDraftText: [
            'HPI:',
            'Patient reports mood remains depressed with poor sleep.',
            '',
            'Risk:',
            'Denies active intent but collateral review remains pending.',
            '',
            'Plan:',
            'Continue source-supported safety monitoring.',
          ].join('\n'),
        },
      }),
    }));

    const payload = await response.json();
    expect(payload.eval?.routePriority).toBe('note-format-draft-shape');
    expect(payload.message).toContain('concise sectioned format');
    expect(payload.actions?.[0]?.draftText).toContain('HPI:\nPatient reports mood remains depressed');
    expect(payload.actions?.[0]?.draftText).toContain('Risk:\nDenies active intent');
    expect(payload.actions?.[0]?.draftText).toContain('Plan:\nContinue source-supported safety monitoring');
  });

  it('does not treat medication-reference follow-up shorthand as draft formatting just because a draft is visible', async () => {
    const initialResponse = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'messy source: antipsychotic metabolic labs?',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          currentDraftText: 'HPI:\nPatient reports anxiety is partially improved.',
        },
      }),
    }));
    const initialPayload = await initialResponse.json();

    const followupResponse = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stage: 'review',
        mode: 'workflow-help',
        message: 'make practical; 1 para ok',
        context: {
          providerAddressingName: 'Daniel Hale',
          noteType: 'Inpatient Psych Progress Note',
          currentDraftText: 'HPI:\nPatient reports anxiety is partially improved.',
        },
        recentMessages: [
          { role: 'provider', content: 'messy source: antipsychotic metabolic labs?' },
          {
            role: 'assistant',
            content: initialPayload.message,
            answerMode: initialPayload.answerMode,
          },
        ],
      }),
    }));

    const payload = await followupResponse.json();
    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.builderFamily).toBe('medication-boundary');
    expect(payload.message).toMatch(/metabolic|monitoring|labs/i);
    expect(payload.message).not.toContain('one-paragraph format');
    expect(payload.actions?.[0]?.type).not.toBe('apply-draft-rewrite');
  });
});
