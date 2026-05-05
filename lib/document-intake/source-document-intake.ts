export const DOCUMENT_INTAKE_MAX_CHARACTERS = 30_000;

export type DocumentSourceKind = 'text' | 'pdf' | 'image' | 'word' | 'spreadsheet' | 'unknown';
export type DocumentExtractionMode = 'browser-text' | 'manual-ocr-review' | 'manual-summary';
export type DocumentIntakeAutomationCapability =
  | 'browser-text-now'
  | 'provider-reviewed-ocr-now'
  | 'provider-summary-now'
  | 'future-pdf-text-extraction'
  | 'future-image-ocr'
  | 'future-word-parser'
  | 'future-spreadsheet-parser';

export type DocumentIntakePlan = {
  sourceKind: DocumentSourceKind;
  extractionMode: DocumentExtractionMode;
  canAutoReadBrowserText: boolean;
  capability: DocumentIntakeAutomationCapability;
  providerInstruction: string;
  futureAutomation: string;
  targetSourceLane: 'Pre-Visit Data';
};

export type ReviewedDocumentSourceInput = {
  fileName?: string;
  mimeType?: string;
  sourceKind?: DocumentSourceKind;
  extractionMode: DocumentExtractionMode;
  reviewedText: string;
};

export type DocumentReliabilityWarningId =
  | 'pending-results'
  | 'clearance-uncertain'
  | 'diagnosis-overclaim-risk'
  | 'collateral-conflict'
  | 'ocr-review-required'
  | 'truncated-source';

export type DocumentReliabilityWarning = {
  id: DocumentReliabilityWarningId;
  label: string;
  instruction: string;
};

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'rtf', 'log']);
const WORD_EXTENSIONS = new Set(['doc', 'docx']);
const SPREADSHEET_EXTENSIONS = new Set(['xls', 'xlsx']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'heic', 'tif', 'tiff', 'webp']);

function extensionFromFileName(fileName = '') {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
}

export function sanitizeDocumentFileName(fileName = '') {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return 'Pasted document source';
  }

  return trimmed.replace(/[^\w .()[\]-]/g, '_').slice(0, 140);
}

export function classifyDocumentSourceKind(fileName = '', mimeType = ''): DocumentSourceKind {
  const extension = extensionFromFileName(fileName);
  const normalizedMime = mimeType.toLowerCase();

  if (normalizedMime.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) {
    return 'text';
  }

  if (normalizedMime.includes('pdf') || extension === 'pdf') {
    return 'pdf';
  }

  if (normalizedMime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }

  if (normalizedMime.includes('word') || WORD_EXTENSIONS.has(extension)) {
    return 'word';
  }

  if (normalizedMime.includes('spreadsheet') || SPREADSHEET_EXTENSIONS.has(extension)) {
    return 'spreadsheet';
  }

  return 'unknown';
}

export function canReadDocumentAsBrowserText(fileName = '', mimeType = '') {
  return classifyDocumentSourceKind(fileName, mimeType) === 'text';
}

export function getDocumentIntakePlan(fileName = '', mimeType = ''): DocumentIntakePlan {
  const sourceKind = classifyDocumentSourceKind(fileName, mimeType);
  const canAutoReadBrowserText = canReadDocumentAsBrowserText(fileName, mimeType);

  if (canAutoReadBrowserText) {
    return {
      sourceKind,
      extractionMode: 'browser-text',
      canAutoReadBrowserText,
      capability: 'browser-text-now',
      providerInstruction: 'Readable text can be extracted locally. Review it before loading it into Pre-Visit Data.',
      futureAutomation: 'Already supported for browser-readable text files.',
      targetSourceLane: 'Pre-Visit Data',
    };
  }

  if (sourceKind === 'pdf') {
    return {
      sourceKind,
      extractionMode: 'manual-ocr-review',
      canAutoReadBrowserText,
      capability: 'future-pdf-text-extraction',
      providerInstruction: 'PDF packets need reviewed text first. Paste OCR output or a provider-reviewed summary before loading source.',
      futureAutomation: 'Phase 2 target: PDF text extraction with provider review before drafting.',
      targetSourceLane: 'Pre-Visit Data',
    };
  }

  if (sourceKind === 'image') {
    return {
      sourceKind,
      extractionMode: 'manual-ocr-review',
      canAutoReadBrowserText,
      capability: 'future-image-ocr',
      providerInstruction: 'Scans and photos need OCR/manual review first. Paste reviewed OCR text before loading source.',
      futureAutomation: 'Phase 2 target: image OCR with confidence warnings and provider review.',
      targetSourceLane: 'Pre-Visit Data',
    };
  }

  if (sourceKind === 'word') {
    return {
      sourceKind,
      extractionMode: 'manual-summary',
      canAutoReadBrowserText,
      capability: 'future-word-parser',
      providerInstruction: 'Word documents need copied text or a provider-reviewed summary before loading source.',
      futureAutomation: 'Phase 2 target: Word document text extraction with section detection.',
      targetSourceLane: 'Pre-Visit Data',
    };
  }

  if (sourceKind === 'spreadsheet') {
    return {
      sourceKind,
      extractionMode: 'manual-summary',
      canAutoReadBrowserText,
      capability: 'future-spreadsheet-parser',
      providerInstruction: 'Spreadsheets need reviewed lab/table text or a provider summary before loading source.',
      futureAutomation: 'Phase 2 target: spreadsheet/table extraction for labs and objective data.',
      targetSourceLane: 'Pre-Visit Data',
    };
  }

  return {
    sourceKind,
    extractionMode: 'manual-summary',
    canAutoReadBrowserText,
    capability: 'provider-summary-now',
    providerInstruction: 'Paste provider-reviewed text or a summary before loading this document into source.',
    futureAutomation: 'Future automation depends on the file type and extraction confidence.',
    targetSourceLane: 'Pre-Visit Data',
  };
}

export function normalizeReviewedDocumentText(value: string, maxCharacters = DOCUMENT_INTAKE_MAX_CHARACTERS) {
  const normalized = value
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  if (normalized.length <= maxCharacters) {
    return normalized;
  }

  return `${normalized.slice(0, maxCharacters).trim()}\n\n[Document text truncated for source review. Keep only clinically relevant reviewed excerpts.]`;
}

export function getDocumentReliabilityWarnings(input: {
  reviewedText: string;
  extractionMode: DocumentExtractionMode;
  sourceKind?: DocumentSourceKind;
}) {
  const warnings: DocumentReliabilityWarning[] = [];
  const normalized = input.reviewedText.toLowerCase();
  const sourceKind = input.sourceKind || 'unknown';

  if (/\b(pending|ordered but not resulted|awaiting|not resulted|not visible|not visable|not included|question mark|\?)\b/.test(normalized)) {
    warnings.push({
      id: 'pending-results',
      label: 'Pending or incomplete results are present.',
      instruction: 'Do not convert pending, missing, question-marked, or not-visible results into normal/negative findings.',
    });
  }

  if (/\b(?:med clear\?|medical(?:ly)? clear\?|medical clearance\b|cleared for psych\b|cleared for psychiatric\b)/.test(normalized)) {
    warnings.push({
      id: 'clearance-uncertain',
      label: 'Medical clearance wording needs source-bound review.',
      instruction: 'Do not state medically cleared unless the reviewed source clearly supports final clearance.',
    });
  }

  if (/\b(rule out|r\/o|history of|historical|prior diagnosis|listed diagnosis|diagnosis listed|not confirmed|uncertain|provisional)\b/.test(normalized)) {
    warnings.push({
      id: 'diagnosis-overclaim-risk',
      label: 'Diagnosis labels may be historical, provisional, or unconfirmed.',
      instruction: 'Keep diagnosis labels attributed to the outside record unless the current assessment independently supports them.',
    });
  }

  if (/\b(collateral|mother|father|partner|spouse|staff|nursing|school|police)\b/.test(normalized)
    && /\b(denies|denied|disputes|contradict|conflict|but|however)\b/.test(normalized)) {
    warnings.push({
      id: 'collateral-conflict',
      label: 'Collateral/source conflict may be present.',
      instruction: 'Preserve patient report, collateral report, staff observation, and objective data as separate source voices.',
    });
  }

  if (input.extractionMode === 'manual-ocr-review' || sourceKind === 'pdf' || sourceKind === 'image') {
    warnings.push({
      id: 'ocr-review-required',
      label: 'Reviewed OCR/scanned-source limitations apply.',
      instruction: 'Treat OCR text as provider-reviewed source material, not a perfect source of truth.',
    });
  }

  if (/\[document text truncated/i.test(input.reviewedText)) {
    warnings.push({
      id: 'truncated-source',
      label: 'Document source was truncated.',
      instruction: 'Avoid implying the reviewed excerpt represents the full outside record.',
    });
  }

  return warnings.filter((warning, index, all) => (
    all.findIndex((candidate) => candidate.id === warning.id) === index
  ));
}

export function inferDocumentSourceBucket(text: string) {
  const normalized = text.toLowerCase();

  if (/\b(lab|cbc|cmp|sodium|potassium|creatinine|lithium|valproate|anc|uds|urine|bal|tox)\b/.test(normalized)) {
    return 'labs / objective data';
  }

  if (/\b(er|ed|emergency|discharge|admission|hospital|triage)\b/.test(normalized)) {
    return 'ER / hospital record';
  }

  if (/\b(refer|referral|previous provider|therapist|collateral|records request)\b/.test(normalized)) {
    return 'referral / collateral';
  }

  if (/\b(medication|med list|allerg|dose|pharmacy|rx)\b/.test(normalized)) {
    return 'medications / allergies';
  }

  if (/\b(suicid|homicid|self-harm|violence|threat|safety|attempt)\b/.test(normalized)) {
    return 'risk / safety';
  }

  return 'outside record';
}

export function documentExtractionModeLabel(mode: DocumentExtractionMode) {
  switch (mode) {
    case 'browser-text':
      return 'browser text extraction';
    case 'manual-ocr-review':
      return 'manual OCR text reviewed by provider';
    case 'manual-summary':
    default:
      return 'provider-entered document summary';
  }
}

export function buildReviewedDocumentSourceBlock(input: ReviewedDocumentSourceInput) {
  const reviewedText = normalizeReviewedDocumentText(input.reviewedText);

  if (!reviewedText) {
    return '';
  }

  const sourceKind = input.sourceKind || classifyDocumentSourceKind(input.fileName, input.mimeType);
  const fileName = sanitizeDocumentFileName(input.fileName);
  const bucket = inferDocumentSourceBucket(reviewedText);
  const warnings = getDocumentReliabilityWarnings({
    reviewedText,
    extractionMode: input.extractionMode,
    sourceKind,
  });

  return [
    `Reviewed Document Source: ${fileName}`,
    `Source type: ${sourceKind}`,
    `Likely source bucket: ${bucket}`,
    `Extraction mode: ${documentExtractionModeLabel(input.extractionMode)}`,
    'Review status: provider reviewed before loading into source.',
    'Use instruction: preserve attribution and uncertainty; do not convert OCR or outside-record text into confirmed facts unless supported.',
    ...(warnings.length ? [
      'Reliability warnings:',
      ...warnings.map((warning) => `- ${warning.label} ${warning.instruction}`),
    ] : []),
    '',
    reviewedText,
  ].join('\n');
}
