import { describe, expect, it } from 'vitest';
import { evaluateDischarge } from '@/lib/veranote/workflow/discharge-evaluator';
import { summarizeTrends } from '@/lib/veranote/workflow/longitudinal-context';
import { suggestNextActions } from '@/lib/veranote/workflow/next-action-engine';
import { suggestTasks } from '@/lib/veranote/workflow/task-suggester';
import { suggestTriage } from '@/lib/veranote/workflow/triage-engine';
import type { KnowledgeBundle } from '@/lib/veranote/knowledge/types';

const emptyKnowledgeBundle: KnowledgeBundle = {
  query: {
    text: 'workflow support',
    intent: 'draft_support',
  },
  matchedIntents: ['draft_support'],
  diagnosisConcepts: [],
  codingEntries: [],
  medicationConcepts: [],
  emergingDrugConcepts: [],
  workflowGuidance: [],
  trustedReferences: [],
  memoryItems: [],
};

describe('workflow layer', () => {
  it('suggests conservative next actions for missing MSE and unclear risk', () => {
    const result = suggestNextActions(
      'Patient mentioned feeling unsafe last night but the note does not clarify current SI. Calm and cooperative.',
      emptyKnowledgeBundle,
    );

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.suggestion).toMatch(/Consider|May be appropriate/);
    expect(result.some((item) => /MSE|suicide/i.test(`${item.suggestion} ${item.rationale}`))).toBe(true);
  });

  it('suggests emergency triage conservatively for documented plan-level risk', () => {
    const result = suggestTriage(
      'Patient has suicidal thoughts with a plan to overdose, cannot contract for safety, and is unsafe if discharged.',
    );

    expect(result.level).toBe('emergency');
    expect(result.reasoning.join(' ')).toContain('may support emergency-level evaluation');
  });

  it('returns ready discharge only when supports are documented and barriers are absent', () => {
    const result = evaluateDischarge(
      'Patient denies SI/HI, is calm and cooperative, reports improved sleep, safety plan reviewed, and outpatient follow-up arranged.',
    );

    expect(result.readiness).toBe('ready');
    expect(result.supportingFactors.length).toBeGreaterThan(0);
  });

  it('summarizes simple longitudinal recurrence and trend language', () => {
    const result = summarizeTrends([
      'Patient has anxiety and panic with worsening sleep.',
      'Returned to ED after failed outpatient stabilization and ongoing suicidal ideation.',
      'Ongoing suicidal ideation continues after another failed outpatient plan.',
      'Anxiety continues and outpatient plan was not enough.',
    ]);

    expect(result.symptomTrends.join(' ')).toContain('Anxiety-related symptoms recur');
    expect(result.riskTrends.join(' ')).toContain('Acute safety language');
  });

  it('suggests concrete workflow tasks without sounding directive', () => {
    const triage = suggestTriage('Patient denies hallucinations but appears internally preoccupied and has no safe discharge plan.');
    const discharge = evaluateDischarge('Patient denies hallucinations but appears internally preoccupied and has no safe discharge plan.');
    const result = suggestTasks({
      sourceText: 'Patient denies hallucinations but appears internally preoccupied and has no safe discharge plan.',
      triage,
      discharge,
      longitudinal: summarizeTrends(['Prior note: no safe discharge plan identified.']),
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.some((item) => /discharge supports|contradictions|MSE/i.test(`${item.task} ${item.reason}`))).toBe(true);
  });
});
