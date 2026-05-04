import { describe, expect, it } from 'vitest';

import { buildSourceInputFromSections } from '@/lib/ai/source-sections';
import {
  runSourcePacketNoteGenerationRegression,
  sourcePacketRegressionCases,
} from '@/lib/eval/note-generation/source-packet-regression';

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
    const report = await runSourcePacketNoteGenerationRegression();

    expect(report.total).toBe(sourcePacketRegressionCases.length);
    expect(report.failed, JSON.stringify(report.cases.filter((item) => !item.passed), null, 2)).toBe(0);
    expect(report.cases.every((item) => item.mode === 'live')).toBe(true);
  }, 900_000);
});
