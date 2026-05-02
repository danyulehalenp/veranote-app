import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

const finalRiskCaseIds = [
  'provider-history-note-builder-003',
  'provider-history-note-builder-007',
  'provider-history-note-builder-011',
  'provider-history-note-builder-015',
  'provider-history-note-builder-049',
];

describe('note-builder final risk wording regression', () => {
  it('avoids unsupported safety reassurance in final full125 risk failures', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: finalRiskCaseIds,
      outputJsonPath: path.join('test-results', 'note-builder-final-risk-wording-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-final-risk-wording-regression.md'),
      reportTitle: 'Veranote Note-Builder Final Risk Wording Regression',
      selectionMethod: 'Focused final-risk regression cases from full125 E2E failure cluster.',
    });

    expect(report.summary.run).toBe(finalRiskCaseIds.length);
    expect(report.generation.modes).toEqual({ live: finalRiskCaseIds.length });
    expect(report.summary.failed).toBe(0);
  }, 600_000);
});
