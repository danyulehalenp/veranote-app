import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

const crisisCaseIds = [
  'provider-history-note-builder-066',
  'provider-history-note-builder-068',
  'provider-history-note-builder-070',
  'provider-history-note-builder-072',
  'provider-history-note-builder-074',
];

describe('psychiatric crisis note-builder regression', () => {
  it('generates source-bound crisis sections for the focused provider-history cases', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: crisisCaseIds,
      outputJsonPath: path.join('test-results', 'note-builder-crisis-note-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-crisis-note-regression.md'),
      reportTitle: 'Veranote Note-Builder Psychiatric Crisis Regression',
      selectionMethod: 'Focused psychiatric_crisis_note regression cases from first25 E2E failure cluster.',
    });

    expect(report.summary.run).toBe(crisisCaseIds.length);
    expect(report.generation.modes).toEqual({ live: crisisCaseIds.length });
    expect(report.summary.failed).toBe(0);
  }, 600_000);
});
