import { describe, expect, it } from 'vitest';
import { buildPsychDiagnosisCodingHelp } from '@/lib/veranote/assistant-psych-diagnosis-coding';

describe('assistant psych diagnosis coding', () => {
  it('answers OCD-spectrum coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 code for ocd?', 'Daniel, ');

    expect(response?.message).toContain('F42.9');
    expect(response?.message).toContain('F42.2');
  });

  it('answers adjustment disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for adjustment disorder?', '');

    expect(response?.message).toContain('F43.20');
    expect(response?.message).toContain('F43.23');
  });

  it('answers schizophrenia-spectrum coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for schizoaffective disorder?', '');

    expect(response?.message).toContain('F25.0');
    expect(response?.message).toContain('F25.1');
  });

  it('answers personality disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for borderline personality disorder?', '');

    expect(response?.message).toContain('F60.3');
  });

  it('answers stimulant use disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for stimulant use disorder?', '');

    expect(response?.message).toContain('F15.90');
  });

  it('answers eating disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for anorexia nervosa?', '');

    expect(response?.message).toContain('F50.00');
    expect(response?.message).toContain('F50.01');
    expect(response?.message).toContain('F50.02');
  });

  it('answers broader personality disorder subtype questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for narcissistic personality disorder?', '');

    expect(response?.message).toContain('F60.81');
  });

  it('answers delusional disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for delusional disorder?', '');

    expect(response?.message).toContain('F22');
  });

  it('answers substance-specific cocaine use disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for cocaine use disorder?', '');

    expect(response?.message).toContain('F14.10');
    expect(response?.message).toContain('F14.20');
  });

  it('answers acute stress disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for acute stress disorder?', '');

    expect(response?.message).toContain('F43.0');
  });

  it('answers autism spectrum disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for autism spectrum disorder?', '');

    expect(response?.message).toContain('F84.0');
  });

  it('answers dissociative identity disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for dissociative identity disorder?', '');

    expect(response?.message).toContain('F44.81');
  });

  it('answers somatic symptom disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for somatic symptom disorder?', '');

    expect(response?.message).toContain('F45.1');
  });

  it('answers sleep-wake disorder questions beyond insomnia', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for nightmare disorder?', '');

    expect(response?.message).toContain('F51.5');
  });

  it('answers neurocognitive disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for dementia?', '');

    expect(response?.message).toContain('F03.A0');
    expect(response?.message).toContain('F03.B0');
    expect(response?.message).toContain('F03.C0');
  });

  it('answers elimination disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for enuresis?', '');

    expect(response?.message).toContain('F98.0');
  });

  it('answers gender-dysphoria-related coding questions with terminology caveat', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for gender dysphoria?', '');

    expect(response?.message).toContain('F64.0');
    expect(response?.message).toContain('F64.9');
    expect(response?.message).toContain('older labels');
  });

  it('answers sexual dysfunction coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for premature ejaculation?', '');

    expect(response?.message).toContain('F52.4');
  });

  it('answers paraphilic disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for voyeurism?', '');

    expect(response?.message).toContain('F65.3');
  });

  it('answers persistent depressive disorder coding questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for dysthymia?', '');

    expect(response?.message).toContain('F34.1');
  });

  it('answers agoraphobia and panic subtype questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for panic disorder with agoraphobia?', '');

    expect(response?.message).toContain('F40.01');
    expect(response?.message).toContain('F40.00');
  });

  it('answers bipolar depressed severe without psychotic features questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for bipolar disorder current episode depressed severe without psychotic features?', '');

    expect(response?.message).toContain('F31.4');
  });

  it('answers learning and language disorder questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for expressive language disorder?', '');

    expect(response?.message).toContain('F80.1');
  });

  it('answers disruptive disorder questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for oppositional defiant disorder?', '');

    expect(response?.message).toContain('F91.3');
  });

  it('answers alcohol remission and withdrawal branch questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for alcohol dependence in remission?', '');

    expect(response?.message).toContain('F10.21');
    expect(response?.message).toContain('F10.11');
  });

  it('answers opioid withdrawal branch questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for opioid dependence with withdrawal?', '');

    expect(response?.message).toContain('F11.23');
  });

  it('answers MDD remission branch questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for recurrent major depressive disorder in full remission?', '');

    expect(response?.message).toContain('F33.42');
  });

  it('answers cyclothymic disorder questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for cyclothymic disorder?', '');

    expect(response?.message).toContain('F34.0');
  });

  it('answers bipolar remission specifier questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for bipolar disorder in partial remission most recent episode depressed?', '');

    expect(response?.message).toContain('F31.75');
  });

  it('answers body dysmorphic disorder questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for body dysmorphic disorder?', '');

    expect(response?.message).toContain('F45.22');
  });

  it('answers impulse control disorder questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for intermittent explosive disorder?', '');

    expect(response?.message).toContain('F63.81');
  });

  it('falls back to the structured diagnosis catalog for diagnoses outside the current hardcoded branches', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the icd 10 for catatonia?', '');

    expect(response?.message).toContain('Catatonia');
    expect(response?.message).toContain('F06.1');
  });

  it('falls back to the structured diagnosis catalog for substance-induced diagnosis questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for substance induced psychosis?', '');

    expect(response?.message).toContain('Substance/medication-induced psychotic disorder');
    expect(response?.message).toContain('F1x.95');
  });

  it('uses the priority structured diagnosis path for hoarding disorder questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for hoarding disorder?', '');

    expect(response?.message).toContain('Hoarding disorder');
    expect(response?.message).toContain('F42.3');
  });

  it('uses the priority structured diagnosis path for bipolar I diagnosis questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for bipolar I disorder?', '');

    expect(response?.message).toContain('Bipolar I disorder');
    expect(response?.message).toContain('F31.x');
  });

  it('uses the priority structured diagnosis path for substance-induced depressive disorder questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for substance induced depressive disorder?', '');

    expect(response?.message).toContain('Substance/medication-induced depressive disorder');
    expect(response?.message).toContain('F1x.94');
  });

  it('uses the priority structured diagnosis path for conduct disorder questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for conduct disorder?', '');

    expect(response?.message).toContain('Conduct disorder');
    expect(response?.message).toContain('F91.x');
  });

  it('uses the priority structured diagnosis path for specific learning disorder questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for specific learning disorder?', '');

    expect(response?.message).toContain('Specific learning disorder');
    expect(response?.message).toContain('F81.x');
  });

  it('uses the priority structured diagnosis path for premenstrual dysphoric disorder questions', () => {
    const response = buildPsychDiagnosisCodingHelp('what is the diagnosis code for pmdd?', '');

    expect(response?.message).toContain('Premenstrual dysphoric disorder');
    expect(response?.message).toContain('N94.3');
  });
});
