import { describe, expect, it } from 'vitest';
import { buildPsychDiagnosisConceptHelp } from '@/lib/veranote/assistant-psych-diagnosis-concepts';

describe('assistant psych diagnosis concepts', () => {
  it('answers plain-language depression concept questions', () => {
    const response = buildPsychDiagnosisConceptHelp('what do you know about depression?');

    expect(response?.message).toContain('When providers say depression broadly');
    expect(response?.message).toContain('major depressive disorder');
    expect(response?.suggestions?.some((item) => item.includes('ICD-10-CM coding family'))).toBe(true);
    expect(response?.references?.[0]?.url).toContain('nimh.nih.gov');
  });

  it('answers plain-language bipolar concept questions', () => {
    const response = buildPsychDiagnosisConceptHelp('tell me about bipolar ii disorder');

    expect(response?.message).toContain('Bipolar disorder marked by at least one hypomanic episode');
    expect(response?.message).toContain('Hypomanic duration and functional change matter');
  });

  it('answers broad anxiety family questions with syndrome distinctions', () => {
    const response = buildPsychDiagnosisConceptHelp('what do you know about anxiety?');

    expect(response?.message).toContain('separate chronic diffuse worry from panic');
    expect(response?.message).toContain('Excessive, hard-to-control worry');
    expect(response?.suggestions?.some((item) => item.includes('Panic disorder is more attack-driven'))).toBe(true);
  });

  it('answers bipolar I versus bipolar II comparison questions', () => {
    const response = buildPsychDiagnosisConceptHelp('bipolar i vs bipolar ii');

    expect(response?.message).toContain('mania versus hypomania');
    expect(response?.message).toContain('Bipolar I requires at least one manic episode');
    expect(response?.message).toContain('Bipolar II requires hypomania');
  });

  it('answers psychosis versus substance-induced psychosis comparison questions', () => {
    const response = buildPsychDiagnosisConceptHelp('psychosis versus substance induced psychosis');

    expect(response?.message).toContain('timing is everything');
    expect(response?.suggestions?.some((item) => item.includes('temporal sequence'))).toBe(true);
  });

  it('does not hijack coding questions', () => {
    const response = buildPsychDiagnosisConceptHelp('what is the diagnosis code for depression?');

    expect(response).toBeNull();
  });
});
