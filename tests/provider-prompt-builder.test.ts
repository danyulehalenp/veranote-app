import { describe, expect, it } from 'vitest';

import {
  analyzeProviderPromptDraft,
  buildProviderPromptStudioDraft,
  getPromptStudioGoalOptions,
  sanitizeProviderPromptName,
} from '@/lib/veranote/provider-prompt-builder';

describe('provider prompt builder', () => {
  it('builds a reusable prompt from structured clinician goals', () => {
    const draft = buildProviderPromptStudioDraft({
      noteType: 'Inpatient Psych Follow-Up',
      specialty: 'Psychiatry',
      outputDestination: 'WellSky',
      selectedGoalIds: ['two-paragraph-story', 'preserve-risk-conflict', 'do-not-fill-mse'],
      freeText: 'Make the note flow like a story but keep risk wording source-close.',
    });

    expect(draft).toContain('Reusable prompt for Inpatient Psych Follow-Up');
    expect(draft).toContain('Destination: format cleanly for WellSky');
    expect(draft).toContain('put HPI/interval history in the first paragraph');
    expect(draft).toContain('patient denial, collateral concern, observed behavior, and clinician assessment distinct');
    expect(draft).toContain('Do not fill normal MSE elements');
    expect(draft).toContain('Patient-specific facts');
    expect(draft).toContain('Provider preference to incorporate');
  });

  it('warns when a reusable prompt appears to contain PHI or encounter-specific facts', () => {
    const warnings = analyzeProviderPromptDraft('Patient reports she takes lithium and DOB 01/02/1980. Fill in normal MSE and say no risk if SI is denied.');

    expect(warnings.map((warning) => warning.id)).toContain('possible-phi');
    expect(warnings.map((warning) => warning.id)).toContain('possible-patient-fact');
    expect(warnings.map((warning) => warning.id)).toContain('unsafe-template-instruction');
  });

  it('keeps therapy builder goals away from medical-heavy confounder defaults', () => {
    const options = getPromptStudioGoalOptions('Therapy DAP progress note');

    expect(options.some((option) => option.id === 'medical-psych-confounders')).toBe(false);
    expect(options.some((option) => option.id === 'preserve-source-uncertainty')).toBe(true);
  });

  it('sanitizes provider prompt names without dropping useful wording', () => {
    expect(sanitizeProviderPromptName('  My ✨ WellSky <Follow-Up> Prompt  ')).toBe('My WellSky Follow-Up Prompt');
    expect(sanitizeProviderPromptName('')).toBe('My Note Prompt');
  });
});
