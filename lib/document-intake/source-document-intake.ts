export const DOCUMENT_INTAKE_MAX_CHARACTERS = 30_000;

export type DocumentSourceKind = 'text' | 'pdf' | 'image' | 'word' | 'spreadsheet' | 'unknown';
export type DocumentExtractionMode = 'browser-text' | 'manual-ocr-review' | 'manual-summary';

export type ReviewedDocumentSourceInput = {
  fileName?: string;
  mimeType?: string;
  sourceKind?: DocumentSourceKind;
  extractionMode: DocumentExtractionMode;
  reviewedText: string;
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

  return [
    `Reviewed Document Source: ${fileName}`,
    `Source type: ${sourceKind}`,
    `Likely source bucket: ${bucket}`,
    `Extraction mode: ${documentExtractionModeLabel(input.extractionMode)}`,
    'Review status: provider reviewed before loading into source.',
    'Use instruction: preserve attribution and uncertainty; do not convert OCR or outside-record text into confirmed facts unless supported.',
    '',
    reviewedText,
  ].join('\n');
}
