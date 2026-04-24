import type { ProviderMemoryCandidate, ProviderMemoryCategory } from '@/lib/veranote/memory/memory-types';

function nowIso() {
  return new Date().toISOString();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildCandidate(providerId: string, category: ProviderMemoryCategory, content: string, tags: string[], rationale: string): ProviderMemoryCandidate {
  const timestamp = nowIso();
  return {
    id: `memory-candidate:${slug(category)}:${slug(content).slice(0, 48) || 'candidate'}`,
    providerId,
    category,
    content,
    tags,
    confidence: 'low',
    source: 'learned',
    createdAt: timestamp,
    updatedAt: timestamp,
    rationale,
  };
}

function uniqueByContent(items: ProviderMemoryCandidate[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.category}:${item.content.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function extractMemoryFromOutput(noteText: string, providerId = 'unknown-provider') {
  if (!noteText.trim()) {
    return [] as ProviderMemoryCandidate[];
  }

  const candidates: ProviderMemoryCandidate[] = [];
  const sectionHeaders = Array.from(noteText.matchAll(/^(assessment|plan|hpi|history of present illness|mental status exam|mse|diagnosis|medications?)\s*:?\s*$/gim))
    .map((match) => match[1].trim().toUpperCase());

  if (sectionHeaders.length >= 2) {
    candidates.push(buildCandidate(
      providerId,
      'structure',
      `Prefers section order starting with ${sectionHeaders.slice(0, 3).join(' -> ')}`,
      ['section-order', ...sectionHeaders.slice(0, 3).map((header) => header.toLowerCase())],
      'Repeated section headers suggest a stable section-order preference.',
    ));
  }

  if ((noteText.match(/\bPatient reports\b/g) || []).length >= 2) {
    candidates.push(buildCandidate(
      providerId,
      'phrasing',
      'Use "Patient reports ..." phrasing when summarizing subjective content supported by source.',
      ['subjective', 'patient-reports'],
      'The note repeatedly uses Patient reports for subjective material.',
    ));
  }

  if ((noteText.match(/\bDenies\b/g) || []).length >= 2) {
    candidates.push(buildCandidate(
      providerId,
      'phrasing',
      'Prefer concise denial phrasing like "Denies ..." when the source explicitly documents a negative symptom or risk statement.',
      ['negative-findings', 'denies'],
      'The note repeatedly uses Denies phrasing for source-backed negatives.',
    ));
  }

  if ((noteText.match(/\bNo evidence of\b/g) || []).length >= 1) {
    candidates.push(buildCandidate(
      providerId,
      'style',
      'Uses "No evidence of ..." phrasing for conservative negative assessment statements when explicitly supported.',
      ['conservative-style', 'negative-assessment'],
      'The note uses conservative no-evidence phrasing instead of stronger factual negatives.',
    ));
  }

  if (/^\s*[-*]\s+/m.test(noteText)) {
    candidates.push(buildCandidate(
      providerId,
      'style',
      'Prefers bulleted formatting for reviewable output.',
      ['bullets', 'formatting'],
      'Bullet markers were detected repeatedly in the note text.',
    ));
  }

  if (/^[A-Z][A-Z\s/]{3,}:?\s*$/m.test(noteText)) {
    candidates.push(buildCandidate(
      providerId,
      'template',
      'Prefers visibly labeled section headers in note output.',
      ['headers', 'template'],
      'All-caps section headers suggest a reusable template preference.',
    ));
  }

  return uniqueByContent(candidates).slice(0, 5);
}
