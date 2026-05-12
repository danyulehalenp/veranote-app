import { describe, expect, it } from 'vitest';

import {
  OUTPUT_DESTINATIONS,
  formatTextForOutputDestination,
  getOutputDestinationFieldTargets,
  getOutputDestinationMeta,
} from '@/lib/veranote/output-destinations';

const sectionedDraft = [
  'HPI:',
  'Patient reports “low mood” and poor sleep — improved from admission.',
  '',
  'Plan:',
  '1. Continue source-supported follow-up wording.',
  '• Recheck risk language before copy.',
].join('\n');

describe('EHR copy-pack formatting', () => {
  it('keeps WellSky copy flatter, ASCII-safe, and manual-paste oriented', () => {
    const formatted = formatTextForOutputDestination({
      text: sectionedDraft,
      destination: 'WellSky',
    });
    const meta = getOutputDestinationMeta('WellSky');

    expect(meta.summaryLabel).toMatch(/WellSky-safe/i);
    expect(meta.preserveHeadings).toBe(false);
    expect(meta.enforceAsciiSafe).toBe(true);
    expect(formatted).not.toMatch(/[“”—•]/);
    expect(formatted).toMatch(/"low mood"/);
    expect(formatted).toMatch(/- improved from admission/);
    expect(formatted).toMatch(/- Continue source-supported follow-up wording/);
  });

  it('returns Tebra psychiatry-specific paste targets for inpatient follow-up workflows', () => {
    const targets = getOutputDestinationFieldTargets('Tebra/Kareo', 'inpatient-psych-follow-up');
    const labels = targets.map((target) => target.label).join(' | ');

    expect(labels).toMatch(/Psych Symptom \/ Follow Up/i);
    expect(labels).toMatch(/MSE/i);
    expect(labels).toMatch(/Psych Intervention \/ Plan/i);
  });

  it('returns TherapyNotes outpatient psych copy targets including risk and current mental status', () => {
    const targets = getOutputDestinationFieldTargets('TherapyNotes', 'outpatient-follow-up');
    const labels = targets.map((target) => target.label).join(' | ');

    expect(labels).toMatch(/Current Mental Status/i);
    expect(labels).toMatch(/Risk Assessment/i);
    expect(labels).toMatch(/Diagnosis \/ assessment \/ plan/i);
  });

  it('keeps expanded EHR destination coverage available for psych and medical workflows', () => {
    expect(OUTPUT_DESTINATIONS).toEqual(expect.arrayContaining([
      'WellSky',
      'Tebra/Kareo',
      'SimplePractice',
      'TherapyNotes',
      'Valant',
      'Epic',
      'Oracle Health/Cerner',
      'athenaOne',
      'eClinicalWorks',
      'Netsmart myAvatar',
      'Qualifacts/CareLogic',
    ]));
  });
});
