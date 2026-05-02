import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

describe('provider-history note-builder E2E first 25 evaluation', () => {
  it('runs the prioritized first 25 evaluation and writes result artifacts', async () => {
    const report = await runProviderHistoryNoteBuilderE2e();

    expect(report.runtimePath).toBe('/Users/danielhale/.openclaw/workspace/app-prototype');
    expect(report.bankPath).toBe('/Users/danielhale/Documents/New project/lib/eval/note-builder/provider-history-note-builder-bank.json');
    expect(report.summary.selected).toBe(25);
    expect(report.summary.run).toBe(25);
    expect(report.cases).toHaveLength(25);
  }, 600_000);
});
