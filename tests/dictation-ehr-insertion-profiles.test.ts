import { describe, expect, it } from 'vitest';
import { buildDictationInsertionWorkflowProfile } from '@/lib/dictation/ehr-insertion-profiles';

describe('dictation EHR insertion profiles', () => {
  it('builds direct field guidance for named destinations', () => {
    const profile = buildDictationInsertionWorkflowProfile('TherapyNotes', 'outpatient-follow-up');

    expect(profile.supportsDirectFieldInsertion).toBe(true);
    expect(profile.speechBoxMode).toBe('floating-field-box');
    expect(profile.fieldTargets.length).toBeGreaterThan(0);
  });

  it('keeps generic destinations in source-capture mode', () => {
    const profile = buildDictationInsertionWorkflowProfile('Generic');

    expect(profile.supportsDirectFieldInsertion).toBe(false);
    expect(profile.speechBoxMode).toBe('floating-source-box');
  });
});
