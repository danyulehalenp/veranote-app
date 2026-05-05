import {
  buildReviewedDocumentSourceBlock,
  getDocumentReliabilityWarnings,
  type DocumentExtractionMode,
  type DocumentReliabilityWarningId,
  type DocumentSourceKind,
} from '@/lib/document-intake/source-document-intake';

type DocumentIntakeRegressionCase = {
  id: string;
  title: string;
  fileName: string;
  mimeType?: string;
  sourceKind?: DocumentSourceKind;
  extractionMode: DocumentExtractionMode;
  reviewedText: string;
  expectedWarnings: DocumentReliabilityWarningId[];
  required: RegExp[];
  forbidden: RegExp[];
};

export type DocumentIntakeRegressionCaseResult = {
  id: string;
  title: string;
  passed: boolean;
  missing: string[];
  forbiddenHits: string[];
  warningIds: string[];
  blockExcerpt: string;
};

export type DocumentIntakeRegressionReport = {
  total: number;
  passed: number;
  failed: number;
  cases: DocumentIntakeRegressionCaseResult[];
};

export const documentIntakeRegressionCases: DocumentIntakeRegressionCase[] = [
  {
    id: 'er-pdf-pending-labs-clearance-question',
    title: 'ER PDF with pending labs and question-marked clearance keeps uncertainty visible',
    fileName: 'ER packet.pdf',
    mimeType: 'application/pdf',
    extractionMode: 'manual-ocr-review',
    reviewedText: [
      'Provider-reviewed OCR from ER packet.',
      'Lithium level ordered but not resulted.',
      'Transfer note says med clear? with question mark.',
      'CBC page not visible in scan.',
    ].join('\n'),
    expectedWarnings: ['pending-results', 'clearance-uncertain', 'ocr-review-required'],
    required: [/Lithium level ordered but not resulted/i, /Do not state medically cleared/i, /Do not convert pending/i],
    forbidden: [/lithium.*normal/i, /medically cleared\./i, /CBC normal/i],
  },
  {
    id: 'image-ocr-collateral-conflict',
    title: 'Image OCR with patient denial and collateral conflict preserves source voices',
    fileName: 'phone-photo.jpeg',
    mimeType: 'image/jpeg',
    extractionMode: 'manual-ocr-review',
    reviewedText: [
      'Mother collateral reports patient sent goodbye texts.',
      'Patient denies suicidal intent and says mother misunderstood.',
      'Staff note: tearful, guarded.',
    ].join('\n'),
    expectedWarnings: ['collateral-conflict', 'ocr-review-required'],
    required: [/Collateral\/source conflict may be present/i, /Preserve patient report, collateral report/i, /goodbye texts/i],
    forbidden: [/no risk/i, /low risk/i, /safe for discharge/i],
  },
  {
    id: 'prior-provider-docx-historical-diagnoses',
    title: 'Prior-provider document keeps diagnosis labels historical unless current assessment supports them',
    fileName: 'prior-provider-note.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extractionMode: 'manual-summary',
    reviewedText: [
      'Prior diagnosis listed: bipolar disorder, ADHD, PTSD.',
      'Historical medication list includes Adderall and quetiapine.',
      'Current assessment not included in outside record.',
    ].join('\n'),
    expectedWarnings: ['diagnosis-overclaim-risk'],
    required: [/Diagnosis labels may be historical/i, /Keep diagnosis labels attributed/i, /Prior diagnosis listed/i],
    forbidden: [/diagnosed with bipolar disorder\./i, /meets criteria for/i, /current diagnosis confirmed/i],
  },
  {
    id: 'spreadsheet-labs-truncated',
    title: 'Spreadsheet/lab text truncation warns that reviewed excerpt may be incomplete',
    fileName: 'labs.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extractionMode: 'manual-summary',
    reviewedText: [
      'Lab table excerpt: Na 133, K 3.4, creatinine 1.3.',
      '[Document text truncated for source review. Keep only clinically relevant reviewed excerpts.]',
    ].join('\n'),
    expectedWarnings: ['truncated-source'],
    required: [/Document source was truncated/i, /Avoid implying the reviewed excerpt represents the full outside record/i],
    forbidden: [/all labs reviewed/i, /complete lab record/i],
  },
];

export function evaluateDocumentIntakeRegressionCase(
  item: DocumentIntakeRegressionCase,
): DocumentIntakeRegressionCaseResult {
  const warnings = getDocumentReliabilityWarnings({
    reviewedText: item.reviewedText,
    extractionMode: item.extractionMode,
    sourceKind: item.sourceKind,
  });
  const block = buildReviewedDocumentSourceBlock({
    fileName: item.fileName,
    mimeType: item.mimeType,
    sourceKind: item.sourceKind,
    extractionMode: item.extractionMode,
    reviewedText: item.reviewedText,
  });
  const warningIds = warnings.map((warning) => warning.id);
  const missing: string[] = [];
  const forbiddenHits: string[] = [];

  for (const expected of item.expectedWarnings) {
    if (!warningIds.includes(expected)) {
      missing.push(`missing reliability warning: ${expected}`);
    }
  }

  for (const required of item.required) {
    if (!required.test(block)) {
      missing.push(`missing block text: ${required}`);
    }
  }

  for (const forbidden of item.forbidden) {
    if (forbidden.test(block)) {
      forbiddenHits.push(`forbidden block text: ${forbidden}`);
    }
  }

  if (!/preserve attribution and uncertainty/i.test(block)) {
    missing.push('missing source attribution guardrail');
  }

  return {
    id: item.id,
    title: item.title,
    passed: missing.length === 0 && forbiddenHits.length === 0,
    missing,
    forbiddenHits,
    warningIds,
    blockExcerpt: block.replace(/\s+/g, ' ').slice(0, 700),
  };
}

export function runDocumentIntakeRegression(): DocumentIntakeRegressionReport {
  const cases = documentIntakeRegressionCases.map(evaluateDocumentIntakeRegressionCase);
  const failed = cases.filter((item) => !item.passed).length;

  return {
    total: cases.length,
    passed: cases.length - failed,
    failed,
    cases,
  };
}
