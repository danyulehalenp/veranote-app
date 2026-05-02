import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

const outpatientFollowUpCaseIds = Array.from({ length: 10 }, (_, index) => {
  return `provider-history-note-builder-${String(index + 76).padStart(3, '0')}`;
});

describe('outpatient psych follow-up note-builder regression', () => {
  it('generates outpatient follow-up structure for all focused provider-history cases', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: outpatientFollowUpCaseIds,
      outputJsonPath: path.join('test-results', 'note-builder-outpatient-followup-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-outpatient-followup-regression.md'),
      reportTitle: 'Veranote Note-Builder Outpatient Psych Follow-Up Regression',
      selectionMethod: 'Focused outpatient_psych_followup regression cases from full125 E2E failure cluster.',
    });

    expect(report.summary.run).toBe(outpatientFollowUpCaseIds.length);
    expect(report.generation.modes).toEqual({ live: outpatientFollowUpCaseIds.length });
    expect(report.summary.failed).toBe(0);
  }, 600_000);
});
