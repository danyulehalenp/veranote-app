import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

const medicalHandPCaseIds = Array.from({ length: 5 }, (_, index) => {
  return `provider-history-note-builder-${String(index + 56).padStart(3, '0')}`;
});

describe('medical H&P note-builder regression', () => {
  it('generates source-bound medical H&P sections for focused provider-history cases', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: medicalHandPCaseIds,
      outputJsonPath: path.join('test-results', 'note-builder-medical-h-and-p-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-medical-h-and-p-regression.md'),
      reportTitle: 'Veranote Note-Builder Medical H&P Regression',
      selectionMethod: 'Focused medical_h_and_p regression cases from full125 E2E failure cluster.',
    });

    expect(report.summary.run).toBe(medicalHandPCaseIds.length);
    expect(report.generation.modes).toEqual({ live: medicalHandPCaseIds.length });
    expect(report.summary.failed).toBe(0);
  }, 600_000);
});
