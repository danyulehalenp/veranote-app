import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { runProviderHistoryNoteBuilderE2e } from '@/lib/eval/note-builder/provider-history-note-builder-e2e';

describe('note-builder first25 cleanup regression', () => {
  it('keeps risk-heavy case 124 from using unsafe no-safety-concern wording', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: ['provider-history-note-builder-124'],
      outputJsonPath: path.join('test-results', 'note-builder-risk-heavy-case124-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-risk-heavy-case124-regression.md'),
      reportTitle: 'Veranote Note-Builder Risk-Heavy Case 124 Regression',
      selectionMethod: 'Focused risk_heavy_note case 124 cleanup regression.',
    });

    expect(report.summary.run).toBe(1);
    expect(report.generation.modes).toEqual({ live: 1 });
    expect(report.summary.failed).toBe(0);
  }, 600_000);

  it('renders chart/staff source separation for collateral-heavy case 113', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: ['provider-history-note-builder-113'],
      outputJsonPath: path.join('test-results', 'note-builder-collateral-heavy-case113-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-collateral-heavy-case113-regression.md'),
      reportTitle: 'Veranote Note-Builder Collateral-Heavy Case 113 Regression',
      selectionMethod: 'Focused collateral_heavy_note case 113 cleanup regression.',
    });

    expect(report.summary.run).toBe(1);
    expect(report.generation.modes).toEqual({ live: 1 });
    expect(report.summary.failed).toBe(0);
  }, 600_000);

  it('recognizes adult initial eval assessment and plan sections for case 003', async () => {
    const report = await runProviderHistoryNoteBuilderE2e({
      caseIds: ['provider-history-note-builder-003'],
      outputJsonPath: path.join('test-results', 'note-builder-initial-eval-case003-regression.json'),
      outputMarkdownPath: path.join('test-results', 'note-builder-initial-eval-case003-regression.md'),
      reportTitle: 'Veranote Note-Builder Initial Eval Case 003 Regression',
      selectionMethod: 'Focused inpatient_psych_initial_evaluation case 003 cleanup regression.',
    });

    expect(report.summary.run).toBe(1);
    expect(report.generation.modes).toEqual({ live: 1 });
    expect(report.summary.failed).toBe(0);
  }, 600_000);
});
