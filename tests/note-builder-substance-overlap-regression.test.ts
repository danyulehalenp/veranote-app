import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

const substanceOverlapCaseIds = [
  'provider-history-note-builder-097',
  'provider-history-note-builder-099',
  'provider-history-note-builder-101',
];

describe('substance-vs-psych overlap note-builder regression', () => {
  it('generates source-bound overlap sections for the focused provider-history cases', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: substanceOverlapCaseIds,
      outputJsonPath: path.join('test-results', 'note-builder-substance-overlap-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-substance-overlap-regression.md'),
      reportTitle: 'Veranote Note-Builder Substance-vs-Psych Overlap Regression',
      selectionMethod: 'Focused substance_vs_psych_overlap_note regression cases from first25 E2E failure cluster.',
    });

    expect(report.summary.run).toBe(substanceOverlapCaseIds.length);
    expect(report.generation.modes).toEqual({ live: substanceOverlapCaseIds.length });
    expect(report.summary.failed).toBe(0);
  }, 600_000);
});
