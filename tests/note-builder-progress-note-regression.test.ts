import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

const progressNoteCaseIds = Array.from({ length: 20 }, (_, index) => {
  return `provider-history-note-builder-${String(index + 21).padStart(3, '0')}`;
});

describe('inpatient psych progress note-builder regression', () => {
  it('generates source-bound progress-note sections for all inpatient progress cases', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: progressNoteCaseIds,
      outputJsonPath: path.join('test-results', 'note-builder-progress-note-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-progress-note-regression.md'),
      reportTitle: 'Veranote Note-Builder Inpatient Psych Progress Note Regression',
      selectionMethod: 'Focused inpatient_psych_progress_note regression cases from full125 E2E failure cluster.',
    });

    expect(report.summary.run).toBe(progressNoteCaseIds.length);
    expect(report.generation.modes).toEqual({ live: progressNoteCaseIds.length });
    expect(report.summary.failed).toBe(0);
  }, 900_000);
});
