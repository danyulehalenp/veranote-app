import type { SectionReviewState } from '@/types/session';

export type ParsedDraftSection = {
  heading: string;
  body: string;
  anchor: string;
};

function makeSlug(value: string, index: number) {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || `section-${index + 1}`;
}

export function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function parseDraftSections(draftText: string): ParsedDraftSection[] {
  const normalized = draftText.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return [];
  }

  const lines = normalized.split('\n');
  const sections: ParsedDraftSection[] = [];
  let currentHeading = 'Opening';
  let currentBody: string[] = [];

  function pushSection() {
    const body = currentBody.join('\n').trim();
    if (body || sections.length === 0) {
      sections.push({
        heading: currentHeading,
        body,
        anchor: makeSlug(currentHeading, sections.length),
      });
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = /^[A-Z][A-Za-z0-9 /&(),'-]{1,60}:$/.test(trimmed) || /^#{1,3}\s+/.test(trimmed);

    if (isHeading) {
      pushSection();
      currentHeading = trimmed.replace(/^#{1,3}\s+/, '').replace(/:$/, '').trim() || `Section ${sections.length + 1}`;
      currentBody = [];
      continue;
    }

    currentBody.push(line);
  }

  pushSection();

  if (sections.length > 1 && !sections[0].body) {
    return sections.slice(1);
  }

  return sections;
}

export function reconcileSectionReviewState(
  sections: ParsedDraftSection[],
  existingState?: SectionReviewState,
): SectionReviewState {
  const nextEntries = sections.map((section) => {
    const existing = existingState?.[section.anchor];

    return [
      section.anchor,
      {
        heading: section.heading,
        status: existing?.status || 'unreviewed',
        updatedAt: existing?.updatedAt,
        confirmedEvidenceBlockIds: existing?.confirmedEvidenceBlockIds || [],
      },
    ] as const;
  });

  return Object.fromEntries(nextEntries);
}
