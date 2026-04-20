import { describe, expect, it } from 'vitest';
import { planSections, resolveNoteProfile } from '@/lib/note/section-profiles';

describe('section profiles', () => {
  it('resolves psychiatry follow-up profile', () => {
    const profile = resolveNoteProfile('Psychiatry follow-up');
    expect(profile?.id).toBe('psychiatry-follow-up');
  });

  it('does not require standalone MSE for psychiatry HPI-only scope', () => {
    const plan = planSections({
      noteType: 'Psychiatry follow-up',
      requestedScope: 'hpi-only',
    });

    expect(plan.scope).toBe('hpi-only');
    expect(plan.requiresStandaloneMse).toBe(false);
    expect(plan.sections).toEqual(['intervalUpdate']);
  });

  it('does require standalone MSE for psychiatry full-note scope', () => {
    const plan = planSections({
      noteType: 'Psychiatry follow-up',
      requestedScope: 'full-note',
    });

    expect(plan.requiresStandaloneMse).toBe(true);
    expect(plan.sections).toContain('mentalStatus');
  });

  it('uses requested selected sections when valid', () => {
    const plan = planSections({
      noteType: 'Inpatient psych progress note',
      requestedScope: 'selected-sections',
      requestedSections: ['intervalUpdate', 'assessment', 'plan'],
    });

    expect(plan.scope).toBe('selected-sections');
    expect(plan.sections).toEqual(['intervalUpdate', 'assessment', 'plan']);
    expect(plan.requiresStandaloneMse).toBe(false);
  });

  it('includes larger adult eval structure for psych initial adult eval full-note scope', () => {
    const plan = planSections({
      noteType: 'Inpatient psych initial adult eval',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('psych-initial-adult-eval');
    expect(plan.sections).toContain('mentalStatus');
    expect(plan.sections).toContain('hospitalizationJustification');
    expect(plan.sections).toContain('attestation');
    expect(plan.sections).toContain('familyHistory');
    expect(plan.sections).toContain('legalHistory');
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('includes adolescent-specific eval structure for psych initial adolescent eval full-note scope', () => {
    const plan = planSections({
      noteType: 'Inpatient psych initial adolescent eval',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('psych-initial-adolescent-eval');
    expect(plan.sections).toContain('developmentalEducationalHistory');
    expect(plan.sections).toContain('familyHistory');
    expect(plan.sections).toContain('traumaHistory');
    expect(plan.requiresStandaloneMse).toBe(true);
  });
});
