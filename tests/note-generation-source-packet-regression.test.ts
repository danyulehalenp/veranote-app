import { describe, expect, it } from 'vitest';

import { buildSourceInputFromSections } from '@/lib/ai/source-sections';
import { evaluateClinicianNoteQualitySweep } from '@/lib/eval/note-generation/clinician-note-quality-sweep';
import {
  runSourcePacketNoteGenerationRegression,
  sourcePacketRegressionCases,
} from '@/lib/eval/note-generation/source-packet-regression';

function parseRegressionCaseIds() {
  const raw = process.env.VERANOTE_SOURCE_PACKET_REGRESSION_CASE_IDS?.trim();
  if (!raw || raw.toLowerCase() === 'all') {
    return undefined;
  }

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

describe('note generation source-packet regression', () => {
  it('assembles the four Veranote source lanes in the order providers see them', () => {
    const sourceInput = buildSourceInputFromSections(sourcePacketRegressionCases[0].sourceSections);

    expect(sourceInput).toContain('Pre-Visit Data:');
    expect(sourceInput).toContain('Live Visit Notes:');
    expect(sourceInput).toContain('Ambient Transcript:');
    expect(sourceInput).toContain('Provider Add-On:');
    expect(sourceInput.indexOf('Pre-Visit Data:')).toBeLessThan(sourceInput.indexOf('Live Visit Notes:'));
    expect(sourceInput.indexOf('Live Visit Notes:')).toBeLessThan(sourceInput.indexOf('Ambient Transcript:'));
    expect(sourceInput.indexOf('Ambient Transcript:')).toBeLessThan(sourceInput.indexOf('Provider Add-On:'));
  });

  it('keeps messy four-lane source packets source-faithful through live generation', async () => {
    const caseIds = parseRegressionCaseIds();
    const requireLive = process.env.VERANOTE_SOURCE_PACKET_REQUIRE_LIVE !== '0';
    const report = await runSourcePacketNoteGenerationRegression({
      caseIds,
      requireLive,
    });

    expect(report.total).toBe(caseIds?.length ?? sourcePacketRegressionCases.length);
    expect(report.failed, JSON.stringify(report.cases.filter((item) => !item.passed), null, 2)).toBe(0);
    if (requireLive) {
      expect(report.cases.every((item) => item.mode === 'live')).toBe(true);
    }

    const clinicianSweep = evaluateClinicianNoteQualitySweep(report);
    if (!caseIds) {
      expect(clinicianSweep.failed, JSON.stringify(clinicianSweep.cases.filter((item) => !item.passed), null, 2)).toBe(0);
      expect(clinicianSweep.areasCovered).toEqual(expect.arrayContaining([
        'risk-wording',
        'source-conflict',
        'medication-reconciliation',
        'document-intake',
        'ehr-formatting',
        'therapy',
        'medical-psych-overlap',
        'social-work',
        'substance-use',
        'cpt-provider-add-on',
      ]));
    }
  }, 900_000);
});
