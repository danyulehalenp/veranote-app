import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

const riskHeavyCaseIds = [
  'provider-history-note-builder-116',
  'provider-history-note-builder-118',
  'provider-history-note-builder-120',
  'provider-history-note-builder-122',
  'provider-history-note-builder-124',
];

describe('risk-heavy note-builder regression', () => {
  it('generates source-bound risk-heavy sections for the focused provider-history cases', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: riskHeavyCaseIds,
      outputJsonPath: path.join('test-results', 'note-builder-risk-heavy-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-risk-heavy-regression.md'),
      reportTitle: 'Veranote Note-Builder Risk-Heavy Regression',
      selectionMethod: 'Focused risk_heavy_note regression cases from first25 E2E failure cluster.',
    });

    expect(report.summary.run).toBe(riskHeavyCaseIds.length);
    expect(report.generation.modes).toEqual({ live: riskHeavyCaseIds.length });
    expect(report.summary.failed).toBe(0);
  }, 600_000);
});
