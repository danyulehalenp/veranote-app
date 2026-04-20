import { describe, expect, it } from 'vitest';
import {
  buildPriorityStructuredPsychDiagnosisHelp,
  buildStructuredPsychDiagnosisCatalogHelp,
  findStructuredPsychDiagnosisFamilyMatch,
  findPriorityStructuredPsychDiagnosisMatch,
  findStructuredPsychDiagnosisMatch,
} from '@/lib/veranote/assistant-psych-diagnosis-catalog';

describe('assistant psych diagnosis catalog', () => {
  it('finds diagnosis matches from the seeded psych diagnosis library', () => {
    const match = findStructuredPsychDiagnosisMatch('what is the icd 10 for catatonia?');

    expect(match?.diagnosis.diagnosis_name).toBe('Catatonia');
    expect(match?.diagnosis.likely_icd10_family).toContain('F06.1');
  });

  it('builds family-level coding help for diagnosis matches not yet covered by hardcoded branches', () => {
    const response = buildStructuredPsychDiagnosisCatalogHelp('what is the icd 10 for catatonia?', 'Daniel, ');

    expect(response?.message).toContain('Daniel, for Catatonia');
    expect(response?.message).toContain('F06.1');
    expect(response?.suggestions?.[0]).toContain('Timeframe matters');
    expect(response?.references?.length).toBeGreaterThan(0);
  });

  it('matches structured diagnosis entries even when provider wording uses loose punctuation', () => {
    const match = findStructuredPsychDiagnosisMatch('what is the diagnosis code for substance induced psychosis?');

    expect(match?.diagnosis.diagnosis_name).toBe('Substance/medication-induced psychotic disorder');
    expect(match?.diagnosis.likely_icd10_family).toContain('F1x.95');
  });

  it('can fall back to family linkage help when a broad family question is asked', () => {
    const familyMatch = findStructuredPsychDiagnosisFamilyMatch('what is the icd 10 family for obsessive compulsive and related disorders?');
    const response = buildStructuredPsychDiagnosisCatalogHelp('what is the icd 10 family for obsessive compulsive and related disorders?', '');

    expect(familyMatch?.linkage.label).toBe('Obsessive-compulsive and related disorders');
    expect(response?.message).toContain('Obsessive-compulsive and related disorders');
    expect(response?.message).toContain('F42');
  });

  it('supports a priority catalog path for exact underserved diagnoses', () => {
    const match = findPriorityStructuredPsychDiagnosisMatch('what is the diagnosis code for hoarding disorder?');
    const response = buildPriorityStructuredPsychDiagnosisHelp('what is the diagnosis code for hoarding disorder?', 'Daniel, ');

    expect(match?.diagnosis.diagnosis_name).toBe('Hoarding disorder');
    expect(response?.message).toContain('Hoarding disorder');
    expect(response?.message).toContain('F42.3');
  });

  it('supports priority catalog matching for exact disorder names that otherwise sit inside broader family branches', () => {
    const learningMatch = findPriorityStructuredPsychDiagnosisMatch('what is the diagnosis code for specific learning disorder?');

    expect(learningMatch?.diagnosis.diagnosis_name).toBe('Specific learning disorder');
  });
});
