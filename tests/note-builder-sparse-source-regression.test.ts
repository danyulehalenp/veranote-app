import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

const sparseSourceCaseIds = Array.from({ length: 10 }, (_, index) => {
  return `provider-history-note-builder-${String(index + 86).padStart(3, '0')}`;
});

describe('sparse-source note-builder regression', () => {
  it('generates limited-source structure for all sparse-source provider-history cases', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: sparseSourceCaseIds,
      outputJsonPath: path.join('test-results', 'note-builder-sparse-source-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-sparse-source-regression.md'),
      reportTitle: 'Veranote Note-Builder Sparse Source Regression',
      selectionMethod: 'Focused sparse_source_note regression cases from full125 E2E failure cluster.',
    });

    expect(report.summary.run).toBe(sparseSourceCaseIds.length);
    expect(report.generation.modes).toEqual({ live: sparseSourceCaseIds.length });
    expect(report.summary.failed).toBe(0);
  }, 600_000);
});
