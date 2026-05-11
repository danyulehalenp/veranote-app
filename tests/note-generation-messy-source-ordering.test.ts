import { describe, expect, it } from 'vitest';

import { buildSourceInputFromSections } from '@/lib/ai/source-sections';
import {
  runSourcePacketNoteGenerationRegression,
  sourcePacketRegressionCases,
} from '@/lib/eval/note-generation/source-packet-regression';

const MESSY_ORDERING_CASE_IDS = [
  'messy-out-of-order-followup-provider-story-prompt',
  'wellsky-inpatient-followup-scrambled-risk-mse-plan',
  'generic-previous-provider-referral-ocr-disputed-medical-psych-history',
];

describe('note generation messy source ordering', () => {
  it('keeps synthetic messy psych cases in the protected source-packet bank', () => {
    const cases = MESSY_ORDERING_CASE_IDS.map((id) => {
      const item = sourcePacketRegressionCases.find((candidate) => candidate.id === id);
      expect(item, id).toBeTruthy();
      return item!;
    });

    const combinedText = cases.map((item) => [
      item.title,
      item.customInstructions,
      item.sourceSections.intakeCollateral,
      item.sourceSections.clinicianNotes,
      item.sourceSections.patientTranscript,
      item.sourceSections.objectiveData,
    ].join('\n')).join('\n\n');

    expect(combinedText).toMatch(/out of order|wrong order|chaotic|pasted/i);
    expect(combinedText).toMatch(/parag|irratated|concetration|anxity|slep|Side efects/i);
    expect(combinedText).toMatch(/scanned|OCR|previous provider|copied forward|referral/i);
    expect(combinedText).toMatch(/Preferred prompt name|Named prompt|Story Follow-Up/i);

    for (const item of cases) {
      const sourceInput = buildSourceInputFromSections(item.sourceSections);
      expect(sourceInput.indexOf('Pre-Visit Data:')).toBeLessThan(sourceInput.indexOf('Live Visit Notes:'));
      expect(sourceInput.indexOf('Live Visit Notes:')).toBeLessThan(sourceInput.indexOf('Ambient Transcript:'));
      expect(sourceInput.indexOf('Ambient Transcript:')).toBeLessThan(sourceInput.indexOf('Provider Add-On:'));
    }
  });

  it('generates professional drafts from scrambled, misspelled, source-conflicted packets', async () => {
    const report = await runSourcePacketNoteGenerationRegression({
      caseIds: MESSY_ORDERING_CASE_IDS,
    });

    expect(report.total).toBe(MESSY_ORDERING_CASE_IDS.length);
    expect(report.failed, JSON.stringify(report.cases.filter((item) => !item.passed), null, 2)).toBe(0);
    expect(report.cases.every((item) => item.mode === 'live')).toBe(true);

    for (const result of report.cases) {
      expect(result.qualityScore, `${result.id} quality score`).toBeGreaterThanOrEqual(86);
      expect(result.noteExcerpt).not.toMatch(/Provider Add-On|Preferred prompt name|Named prompt|Story Follow-Up/i);
    }
  }, 900_000);
});
