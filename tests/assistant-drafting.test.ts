import { describe, expect, it } from 'vitest';
import {
  buildSectionDraft,
  inferDraftSection,
  looksLikeRawClinicalDetail,
  looksMedicalFocused,
  looksPsychFocused,
} from '@/lib/veranote/assistant-drafting';

describe('assistant drafting helpers', () => {
  it('recognizes raw clinical detail input', () => {
    expect(
      looksLikeRawClinicalDetail('Patient reports anxiety is a little better, still sleeping 3 hours nightly, off meds for 4 months, denies SI.')
    ).toBe(true);
  });

  it('detects mixed psych and medical content', () => {
    const detail = 'Patient reports anxiety and poor sleep; UDS positive for THC; glucose 284; BP 168/98.';
    expect(looksPsychFocused(detail)).toBe(true);
    expect(looksMedicalFocused(detail)).toBe(true);
  });

  it('infers a whole-note request from natural wording', () => {
    expect(inferDraftSection('do the whole note first')).toBe('Progress Note');
  });

  it('builds a more clinician-natural HPI draft from messy detail', () => {
    const draft = buildSectionDraft(
      'HPI',
      'patient reports anxiety is a little better, still sleeping 3 hours nightly, off meds for 4 months, denies SI',
      { noteType: 'Inpatient Psych Progress Note' }
    );

    expect(draft).toContain('HPI draft:');
    expect(draft).toContain('Patient reports anxiety is a little better.');
    expect(draft).toContain('Still sleeping 3 hours nightly.');
    expect(draft).toContain('Off meds for 4 months.');
    expect(draft).toContain('Patient denies SI.');
  });

  it('builds an assessment draft that preserves caution', () => {
    const draft = buildSectionDraft(
      'Assessment',
      'Patient reports anxiety is a little better, still sleeping 3 hours nightly, off meds for 4 months, denies SI',
      { noteType: 'Inpatient Psych Progress Note' }
    );

    expect(draft).toContain('Assessment draft:');
    expect(draft).toContain('Current presentation is notable for');
    expect(draft).toContain('slight improvement in anxiety');
    expect(draft).toContain('sleep limited to 3 hours nightly');
    expect(draft).toContain('4 months of medication nonadherence');
    expect(draft).toContain('denial of SI');
    expect(draft).toContain('Keep symptom course, adherence, and risk wording conservative');
  });

  it('builds a mixed-domain whole-note draft with separated framing', () => {
    const draft = buildSectionDraft(
      'Progress Note',
      'Patient reports mood is still low, poor sleep, UDS positive for THC and meth, UPT negative, glucose 284, BP 168/98.',
      { noteType: 'Medical Consultation Note' }
    );

    expect(draft).toContain('Working medical consultation note draft:');
    expect(draft).toContain('Interval Update / HPI:');
    expect(draft).toContain('Assessment:');
    expect(draft).toContain('persistently low mood');
    expect(draft).toContain('Keep psychiatric symptoms, medical findings, medication truth, and safety wording clearly separated');
    expect(draft).toContain('Plan:');
    expect(draft).toContain('Separate psych follow-up from medical monitoring');
  });
});
