import { describe, expect, it } from 'vitest';

import {
  buildSourceInputFromSections,
  describePopulatedSourceSections,
  normalizeSourceSections,
} from '@/lib/ai/source-sections';

describe('Veranote source sections', () => {
  it('keeps dictation, ambient listening, reviewed source, and provider add-on in separate drafting lanes', () => {
    const sections = normalizeSourceSections({
      intakeCollateral: 'Reviewed ER packet: lithium level pending; collateral says medication nonadherence.',
      clinicianNotes: 'Typed/dictated during session: patient reports poor sleep and denies current SI.',
      patientTranscript: 'Ambient transcript: patient says, "I stopped my medication last week."',
      objectiveData: 'Provider Add-On: preserve uncertainty; do not state medically cleared.',
    });

    const sourceInput = buildSourceInputFromSections(sections);
    const populated = describePopulatedSourceSections(sections);

    expect(populated).toEqual([
      'Pre-visit data',
      'Live visit notes',
      'Ambient transcript',
      'Provider add-on',
    ]);
    expect(sourceInput).toContain('Pre-Visit Data:\nReviewed ER packet');
    expect(sourceInput).toContain('Live Visit Notes:\nTyped/dictated during session');
    expect(sourceInput).toContain('Ambient Transcript:\nAmbient transcript');
    expect(sourceInput).toContain('Provider Add-On:\nProvider Add-On');
    expect(sourceInput.indexOf('Pre-Visit Data:')).toBeLessThan(sourceInput.indexOf('Live Visit Notes:'));
    expect(sourceInput.indexOf('Live Visit Notes:')).toBeLessThan(sourceInput.indexOf('Ambient Transcript:'));
    expect(sourceInput.indexOf('Ambient Transcript:')).toBeLessThan(sourceInput.indexOf('Provider Add-On:'));
  });
});
