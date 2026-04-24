import type { PhiEntity } from '@/lib/security/phi-types';

type SupportedPhiType = PhiEntity['type'];

type PhiMatch = {
  type: SupportedPhiType;
  original: string;
  index: number;
};

const ADDRESS_PATTERN = /\b\d{1,5}\s+[A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z][A-Za-z0-9.'-]*){0,5}\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Way|Circle|Cir)\b\.?/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const LABELED_DOB_PATTERN = /\b(?:dob|date of birth|born)\s*[:#-]?\s*((?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|(?:[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}))\b/gi;
const LABELED_MRN_PATTERN = /\b(?:mrn|medical record number|patient id|account number)\s*[:#-]?\s*([A-Z0-9-]{7,})\b/gi;
const UNLABELED_MRN_PATTERN = /\b\d{7,}\b/g;
const LABELED_NAME_PATTERN = /\b(?:name|patient|pt|client|member)\s*[:#-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g;
const LEADING_NAME_PATTERN = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?=\s+(?:DOB|dob|MRN|mrn|reports|states|presents|called|is|was)\b)/gm;
const CONTEXTUAL_NAME_PATTERN = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?=\s+(?:DOB|dob|MRN|mrn|reports|reported|states|stated|presents|presented|called|note|chart)\b)/g;

const NON_NAME_TOKENS = new Set([
  'Avenue',
  'Birth',
  'Boulevard',
  'Chart',
  'Circle',
  'Client',
  'Court',
  'Date',
  'Drive',
  'Lane',
  'Main',
  'Medical',
  'Member',
  'Mental',
  'Name',
  'Patient',
  'Pt',
  'Record',
  'Road',
  'State',
  'Status',
  'Street',
  'Way',
]);

function collectMatches(pattern: RegExp, text: string, type: SupportedPhiType, captureGroup = 0) {
  const matches: PhiMatch[] = [];
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const raw = match[captureGroup];
    if (!raw) {
      continue;
    }

    const offsetWithinMatch = captureGroup === 0 ? 0 : match[0].indexOf(raw);
    matches.push({
      type,
      original: raw.trim(),
      index: match.index + Math.max(offsetWithinMatch, 0),
    });
  }

  return matches;
}

function buildPlaceholder(type: SupportedPhiType, count: number) {
  return `[${type}_${count}]`;
}

function isLikelyPersonName(value: string) {
  const tokens = value.split(/\s+/);
  return tokens.length >= 2 && tokens.every((token) => !NON_NAME_TOKENS.has(token));
}

export function detectPHI(text: string): PhiEntity[] {
  if (!text.trim()) {
    return [];
  }

  const matches: PhiMatch[] = [
    ...collectMatches(EMAIL_PATTERN, text, 'EMAIL'),
    ...collectMatches(PHONE_PATTERN, text, 'PHONE'),
    ...collectMatches(LABELED_DOB_PATTERN, text, 'DOB', 1),
    ...collectMatches(LABELED_MRN_PATTERN, text, 'MRN', 1),
    ...collectMatches(ADDRESS_PATTERN, text, 'ADDRESS'),
    ...collectMatches(LABELED_NAME_PATTERN, text, 'NAME', 1),
    ...collectMatches(LEADING_NAME_PATTERN, text, 'NAME', 1),
    ...collectMatches(CONTEXTUAL_NAME_PATTERN, text, 'NAME', 1),
    ...collectMatches(UNLABELED_MRN_PATTERN, text, 'MRN'),
  ];

  const seen = new Map<string, PhiEntity>();
  const counters: Record<SupportedPhiType, number> = {
    NAME: 0,
    DOB: 0,
    MRN: 0,
    PHONE: 0,
    ADDRESS: 0,
    EMAIL: 0,
  };

  matches
    .sort((left, right) => left.index - right.index || right.original.length - left.original.length)
    .forEach((match) => {
      if (match.type === 'NAME' && !isLikelyPersonName(match.original)) {
        return;
      }

      const key = `${match.type}:${match.original.toLowerCase()}`;
      if (seen.has(key)) {
        return;
      }

      counters[match.type] += 1;
      seen.set(key, {
        type: match.type,
        original: match.original,
        placeholder: buildPlaceholder(match.type, counters[match.type]),
      });
    });

  return [...seen.values()];
}
