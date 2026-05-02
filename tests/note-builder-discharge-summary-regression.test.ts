import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

const dischargeSummaryCaseIds = [
  'provider-history-note-builder-042',
  'provider-history-note-builder-045',
  'provider-history-note-builder-048',
  'provider-history-note-builder-051',
  'provider-history-note-builder-054',
];

describe('inpatient psych discharge summary note-builder regression', () => {
  it('generates source-bound discharge sections and conservative safety wording for focused provider-history cases', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: dischargeSummaryCaseIds,
      outputJsonPath: path.join('test-results', 'note-builder-discharge-summary-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-discharge-summary-regression.md'),
      reportTitle: 'Veranote Note-Builder Discharge Summary Regression',
      selectionMethod: 'Focused inpatient_psych_discharge_summary regression cases from first25 E2E failure cluster.',
    });

    expect(report.summary.run).toBe(dischargeSummaryCaseIds.length);
    expect(report.generation.modes).toEqual({ live: dischargeSummaryCaseIds.length });
    expect(report.summary.failed).toBe(0);
  }, 600_000);
});
