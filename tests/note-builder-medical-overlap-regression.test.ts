import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

const medicalOverlapCaseIds = [
  'provider-history-note-builder-104',
  'provider-history-note-builder-106',
  'provider-history-note-builder-108',
];

describe('medical-vs-psych overlap note-builder regression', () => {
  it('generates source-bound medical overlap sections for the focused provider-history cases', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: medicalOverlapCaseIds,
      outputJsonPath: path.join('test-results', 'note-builder-medical-overlap-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-medical-overlap-regression.md'),
      reportTitle: 'Veranote Note-Builder Medical-vs-Psych Overlap Regression',
      selectionMethod: 'Focused medical_vs_psych_overlap_note regression cases from first25 E2E failure cluster.',
    });

    expect(report.summary.run).toBe(medicalOverlapCaseIds.length);
    expect(report.generation.modes).toEqual({ live: medicalOverlapCaseIds.length });
    expect(report.summary.failed).toBe(0);
  }, 600_000);
});
