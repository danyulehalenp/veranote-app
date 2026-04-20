import { VERANOTE_INTERNAL_DOCUMENTS, type VeranoteDocument } from '@/lib/veranote/assistant-documents';
import type { AssistantApiContext, AssistantResponsePayload } from '@/types/assistant';

type RetrievedDocument = VeranoteDocument & {
  score: number;
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'can',
  'do',
  'does',
  'for',
  'how',
  'i',
  'if',
  'in',
  'is',
  'it',
  'my',
  'of',
  'or',
  'the',
  'to',
  'what',
  'why',
]);

export function retrieveVeranoteDocs(query: string, limit = 2) {
  const normalized = query.toLowerCase().trim();
  const queryTokens = tokenize(normalized);

  return VERANOTE_INTERNAL_DOCUMENTS
    .map((document) => ({
      ...document,
      score: scoreDocument(document, normalized, queryTokens),
    }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function buildRetrievedInternalKnowledgeHelp(normalizedMessage: string, _context?: AssistantApiContext): AssistantResponsePayload | null {
  const matches = retrieveVeranoteDocs(normalizedMessage, 2);
  if (!matches.length) {
    return null;
  }

  if (!looksLikeInternalProductQuestion(normalizedMessage, matches)) {
    return null;
  }

  const primary = matches[0];
  const supporting = matches[1];

  return {
    message: supporting
      ? `${primary.summary} ${supporting.summary}`
      : primary.summary,
    suggestions: [
      ...primary.bullets.slice(0, 2),
      ...(supporting ? supporting.bullets.slice(0, 1) : []),
    ].slice(0, 3),
    references: matches.map((match) => match.reference),
  };
}

function looksLikeInternalProductQuestion(normalizedMessage: string, matches: RetrievedDocument[]) {
  if (/(veranote|vera|provider profile|prompt preferences|preset|review|required|outpatient|medical notes|psych-first|source fidelity|memory)/i.test(normalizedMessage)) {
    return true;
  }

  return matches[0]?.score >= 3;
}

function scoreDocument(document: VeranoteDocument, normalizedQuery: string, queryTokens: string[]) {
  let score = 0;

  for (const keyword of document.keywords) {
    if (normalizedQuery.includes(keyword)) {
      score += keyword.split(/\s+/).length > 1 ? 3 : 2;
    }
  }

  const documentTokens = new Set(tokenize(`${document.title} ${document.summary} ${document.bullets.join(' ')} ${document.keywords.join(' ')}`));
  for (const token of queryTokens) {
    if (documentTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token && !STOP_WORDS.has(token));
}
