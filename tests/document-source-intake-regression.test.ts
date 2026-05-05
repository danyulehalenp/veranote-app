import { describe, expect, it } from 'vitest';

import {
  documentIntakeRegressionCases,
  runDocumentIntakeRegression,
} from '@/lib/eval/document-intake/source-document-intake-regression';

describe('document source intake regression bank', () => {
  it('keeps reviewed document/OCR scenarios broad enough for current ingestion risks', () => {
    expect(documentIntakeRegressionCases.length).toBeGreaterThanOrEqual(4);

    const caseText = documentIntakeRegressionCases.map((item) => [
      item.title,
      item.fileName,
      item.extractionMode,
      item.reviewedText,
    ].join('\n')).join('\n\n');

    expect(caseText).toMatch(/ER PDF|ER packet/i);
    expect(caseText).toMatch(/Image OCR|phone-photo/i);
    expect(caseText).toMatch(/Prior-provider|prior-provider-note/i);
    expect(caseText).toMatch(/Spreadsheet|labs\.xlsx/i);
    expect(caseText).toMatch(/pending|not resulted|truncated|collateral|historical/i);
  });

  it('preserves source attribution and reliability warnings before document text enters note generation', () => {
    const report = runDocumentIntakeRegression();

    expect(report.total).toBe(documentIntakeRegressionCases.length);
    expect(report.failed, JSON.stringify(report.cases.filter((item) => !item.passed), null, 2)).toBe(0);
    expect(report.cases.some((item) => item.warningIds.includes('clearance-uncertain'))).toBe(true);
    expect(report.cases.some((item) => item.warningIds.includes('ocr-review-required'))).toBe(true);
    expect(report.cases.some((item) => item.warningIds.includes('diagnosis-overclaim-risk'))).toBe(true);
  });
});
