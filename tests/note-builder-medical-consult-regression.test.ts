import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

const medicalConsultCaseIds = Array.from({ length: 5 }, (_, index) => {
  return `provider-history-note-builder-${String(index + 61).padStart(3, '0')}`;
});

describe('medical consult note-builder regression', () => {
  it('generates source-bound medical consult sections for focused provider-history cases', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: medicalConsultCaseIds,
      outputJsonPath: path.join('test-results', 'note-builder-medical-consult-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-medical-consult-regression.md'),
      reportTitle: 'Veranote Note-Builder Medical Consult Regression',
      selectionMethod: 'Focused medical_consult_note regression cases from full125 E2E failure cluster.',
    });

    expect(report.summary.run).toBe(medicalConsultCaseIds.length);
    expect(report.generation.modes).toEqual({ live: medicalConsultCaseIds.length });
    expect(report.summary.failed).toBe(0);
  }, 600_000);
});
