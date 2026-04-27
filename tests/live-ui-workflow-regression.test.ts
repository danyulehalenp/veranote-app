import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'ui-workflow-provider',
      role: 'provider',
      email: 'ui-workflow@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'ui-workflow-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

type UiFlowTurn = {
  prompt: string;
  expectedAnswerMode: 'workflow_guidance' | 'chart_ready_wording' | 'warning_language';
  requiredPhrases: string[];
  forbiddenPhrases?: string[];
};

type UiFlowDefinition = {
  id: string;
  stage: 'compose' | 'review';
  noteType: string;
  currentDraftText?: string;
  focusedSectionHeading?: string;
  topHighRiskWarningTitle?: string;
  topHighRiskWarningDetail?: string;
  turns: UiFlowTurn[];
};

const genericMetaMarkers = [
  'keep this source-bound',
  'start with the highest-signal trust issue',
  'the source contains clear high-risk indicators that should be explicitly documented without dilution',
  'get the source in cleanly',
  "i don't have a safe veranote answer for that yet.",
];

function flattenPayload(payload: any) {
  return [payload.message, ...(payload.suggestions || [])].filter(Boolean).join('\n').toLowerCase();
}

function expectIncludes(text: string, phrases: string[], label: string) {
  for (const phrase of phrases) {
    expect(text.includes(phrase.toLowerCase()), `${label} missing phrase: ${phrase}`).toBe(true);
  }
}

function expectExcludes(text: string, phrases: string[], label: string) {
  for (const phrase of phrases) {
    expect(text.includes(phrase.toLowerCase()), `${label} included forbidden phrase: ${phrase}`).toBe(false);
  }
}

const flows: UiFlowDefinition[] = [
  {
    id: 'messy-source-where-do-i-start',
    stage: 'compose',
    noteType: 'Inpatient Psych Admission Note',
    focusedSectionHeading: 'Source intake',
    turns: [
      {
        prompt: 'source is messy pt says better maybe no si now mom says sent goodbye txts last night nursing says pacing + talking to self and uds maybe meth maybe not. where do i start',
        expectedAnswerMode: 'workflow_guidance',
        requiredPhrases: ['workflow guidance:', 'first move', 'patient report', 'collateral', 'observation'],
      },
      {
        prompt: 'ok make that useful for admit note workup',
        expectedAnswerMode: 'workflow_guidance',
        requiredPhrases: ['workflow guidance:', 'hpi or assessment'],
      },
      {
        prompt: 'shorter i just need the first move',
        expectedAnswerMode: 'workflow_guidance',
        requiredPhrases: ['workflow guidance:', 'first move'],
      },
    ],
  },
  {
    id: 'draft-note-improvement',
    stage: 'review',
    noteType: 'Inpatient Psych Progress Note',
    currentDraftText: 'Pt better today and wants dc. Denies si. Slept poorly. Family worried. Sent goodbye texts last night. Says not safe if sent home. Maybe hearing voices. Refused meds then maybe took some later.',
    focusedSectionHeading: 'Assessment',
    topHighRiskWarningTitle: 'Risk contradiction',
    topHighRiskWarningDetail: 'Goodbye texts and unsafe-if-home statement remain in source.',
    turns: [
      {
        prompt: 'word this better not fake-clean',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'goodbye texts', 'not safe if sent home'],
      },
      {
        prompt: 'one paragraph make it chart ready',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'higher-acuity risk facts remain documented'],
      },
      {
        prompt: 'shorter but keep what matters',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'goodbye texts'],
      },
    ],
  },
  {
    id: 'risk-wording-correction',
    stage: 'review',
    noteType: 'Inpatient Psych Progress Note',
    currentDraftText: 'Patient denies SI this morning but sent goodbye texts overnight and says she is not safe if sent home.',
    focusedSectionHeading: 'Risk assessment',
    topHighRiskWarningTitle: 'Low-risk wording not supported',
    topHighRiskWarningDetail: 'Current denial conflicts with higher-acuity risk facts.',
    turns: [
      {
        prompt: 'pt denies si but sent goodbye txts last night idk can i say low risk',
        expectedAnswerMode: 'warning_language',
        requiredPhrases: ['warning:', 'low suicide-risk wording is not supported', 'goodbye texts'],
      },
      {
        prompt: 'give me chart ready wording instead',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'patient currently denies suicidal ideation', 'goodbye texts remain documented'],
      },
      {
        prompt: 'one sentence dont overthink it',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'low-risk wording is not supported'],
      },
    ],
  },
  {
    id: 'discharge-summary-generation',
    stage: 'review',
    noteType: 'Inpatient Psych Discharge Summary',
    currentDraftText: 'Hospital course messy. Pt came in paranoid, yelling, not sleeping. Better some after meds but still AH at times. Wanted out early. Med refusal then partial acceptance. Follow-up not actually scheduled yet. Shelter maybe. Ride unclear.',
    focusedSectionHeading: 'Discharge summary',
    topHighRiskWarningTitle: 'Discharge stability may be overstated',
    topHighRiskWarningDetail: 'Follow-up and support are not confirmed.',
    turns: [
      {
        prompt: 'dc summary from this mess please followup not made yet make it sound ok',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'hospital course', 'follow-up was not yet confirmed'],
      },
      {
        prompt: 'chart ready but dont say stable for dc if not there',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'should not overstate discharge stability'],
      },
      {
        prompt: 'shorter discharge summary paragraph',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'follow-up was not yet confirmed'],
      },
    ],
  },
  {
    id: 'hpi-generation-from-shorthand',
    stage: 'compose',
    noteType: 'Inpatient Psych Admission Note',
    focusedSectionHeading: 'HPI',
    turns: [
      {
        prompt: 'need hpi fast manic maybe meth yesterday collateral says no sleep 4 days spent all paycheck pt says just stressed ems said disorganized in street',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'reason for admission', 'timeline remains unclear', 'substance exposure remains relevant'],
        forbiddenPhrases: ['patient reports need hpi fast manic maybe meth yesterday'],
      },
      {
        prompt: 'make it chart ready hpi and dont invent timeline',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'do not invent chronology'],
      },
      {
        prompt: 'shorter but keep admit reason',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'reason for admission'],
      },
    ],
  },
  {
    id: 'progress-note-refinement',
    stage: 'review',
    noteType: 'Inpatient Psych Progress Note',
    currentDraftText: 'Pt says better. Still hearing voices telling him to die. Wants dc. Slept bad. Says no SI now. Family worried. Refused meds this morning.',
    focusedSectionHeading: 'Assessment / Plan',
    topHighRiskWarningTitle: 'Active psychotic symptoms remain',
    topHighRiskWarningDetail: 'Improvement is partial.',
    turns: [
      {
        prompt: 'word this better pt better some still ah telling him die slept bad wants dc',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'patient-reported improvement remains documented', 'command auditory hallucinations remain documented'],
      },
      {
        prompt: 'one paragraph chart ready',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'one paragraph'],
      },
      {
        prompt: 'shorter but dont lose the voices',
        expectedAnswerMode: 'chart_ready_wording',
        requiredPhrases: ['chart-ready wording:', 'command auditory hallucinations remain documented'],
      },
    ],
  },
];

describe('live UI workflow regression', () => {
  it('keeps real UI assistant flows task-shaped and copy-ready', async () => {
    for (const flow of flows) {
      const recentMessages: Array<{ role: 'provider' | 'assistant'; content: string; answerMode?: string; builderFamily?: string }> = [];

      for (const turn of flow.turns) {
        const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            stage: flow.stage,
            mode: 'workflow-help',
            message: turn.prompt,
            context: {
              providerAddressingName: 'Daniel Hale',
              providerProfileId: 'mixed-inpatient-psych-medical-consult',
              providerProfileName: 'Mixed Inpatient Psych / Medical Consult',
              noteType: flow.noteType,
              currentDraftText: flow.currentDraftText,
              focusedSectionHeading: flow.focusedSectionHeading,
              topHighRiskWarningTitle: flow.topHighRiskWarningTitle,
              topHighRiskWarningDetail: flow.topHighRiskWarningDetail,
            },
            recentMessages,
          }),
        }));

        expect(response.status, `${flow.id} returned bad status`).toBe(200);
        const payload = await response.json();
        const text = flattenPayload(payload);

        expect(payload.answerMode || payload.eval?.answerMode, `${flow.id} ${turn.prompt} answer mode`).toBe(turn.expectedAnswerMode);
        expectIncludes(text, turn.requiredPhrases, `${flow.id} ${turn.prompt}`);
        expectExcludes(text, turn.forbiddenPhrases || [], `${flow.id} ${turn.prompt}`);
        expectExcludes(text, genericMetaMarkers, `${flow.id} ${turn.prompt}`);

        recentMessages.push({ role: 'provider', content: turn.prompt });
        recentMessages.push({
          role: 'assistant',
          content: payload.message,
          answerMode: payload.answerMode,
          builderFamily: payload.builderFamily,
        });
      }
    }
  });
});
