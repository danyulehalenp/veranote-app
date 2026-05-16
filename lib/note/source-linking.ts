import type { SourceSections } from '@/types/session';
import type { ParsedDraftSection } from '@/lib/note/review-sections';

export type SourceBlock = {
  id: string;
  sourceKey: keyof SourceSections;
  sourceLabel: string;
  text: string;
  tokens: string[];
  normalizedText: string;
};

export type SectionEvidenceLink = {
  blockId: string;
  score: number;
  overlapTerms: string[];
  signal: 'strong-overlap' | 'possible-overlap' | 'weak-overlap';
};

export type SectionEvidenceMap = Record<
  string,
  {
    sectionAnchor: string;
    sectionHeading: string;
    sectionTerms: string[];
    links: SectionEvidenceLink[];
  }
>;

export type SectionSentenceEvidence = {
  id: string;
  sectionAnchor: string;
  sectionHeading: string;
  sentence: string;
  links: SectionEvidenceLink[];
};

export type SectionSentenceEvidenceMap = Record<string, SectionSentenceEvidence[]>;

export type SourceTraceSummary = {
  sectionCount: number;
  linkedSectionCount: number;
  linkedSentenceCount: number;
  strongSentenceCount: number;
  possibleSentenceCount: number;
  weakSentenceCount: number;
  unsupportedSectionCount: number;
  linkedSourceLabels: string[];
  sourceUsage: Array<{
    sourceLabel: string;
    count: number;
  }>;
};

const SOURCE_LABELS: Record<keyof SourceSections, string> = {
  intakeCollateral: 'Pre-Visit Data',
  clinicianNotes: 'Live Visit Notes',
  patientTranscript: 'Ambient Transcript',
  objectiveData: 'Provider Add-On',
};

const STOP_WORDS = new Set([
  'a', 'about', 'after', 'again', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before',
  'being', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'here', 'hers',
  'him', 'his', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'may', 'more', 'most', 'no', 'not', 'of', 'on',
  'or', 'our', 'out', 'patient', 'patients', 'reports', 'said', 'says', 'she', 'should', 'so', 'some', 'than', 'that', 'the',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'to', 'up', 'was', 'were', 'what', 'when', 'which', 'who', 'will',
  'with', 'would', 'you', 'your', 'daily', 'note', 'section', 'current', 'today'
]);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\r\n/g, '\n')
    .replace(/[^a-z0-9%/.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function blockPriority(sourceKey: keyof SourceSections, heading: string) {
  const normalizedHeading = heading.toLowerCase();

  if (/med|dose|side effect|medication/.test(normalizedHeading)) {
    return sourceKey === 'objectiveData' ? 0.24 : sourceKey === 'clinicianNotes' ? 0.1 : 0;
  }

  if (/mental status|observation|exam|objective/.test(normalizedHeading)) {
    return sourceKey === 'objectiveData' ? 0.18 : sourceKey === 'clinicianNotes' ? 0.08 : 0;
  }

  if (/safety|risk|assessment|plan/.test(normalizedHeading)) {
    return sourceKey === 'clinicianNotes' ? 0.16 : sourceKey === 'intakeCollateral' ? 0.05 : 0;
  }

  if (/subjective|history|interval|symptom|hpi/.test(normalizedHeading)) {
    return sourceKey === 'patientTranscript' ? 0.16 : sourceKey === 'clinicianNotes' ? 0.06 : 0;
  }

  return sourceKey === 'clinicianNotes' ? 0.04 : 0;
}

function instructionLanePenalty(block: SourceBlock) {
  if (block.sourceKey !== 'objectiveData') {
    return 0;
  }

  if (/\b(provider add-on|named prompt|cpt|billing|preference|instruction|do not|don't|avoid|use .*style)\b/i.test(block.text)) {
    return -0.28;
  }

  return -0.08;
}

function splitSourceIntoBlocks(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return [];
  }

  const paragraphBlocks = normalized
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      if (part.length <= 280) {
        return [part];
      }

      return part
        .split(/(?<=[.!?])\s+(?=[A-Z0-9+-])/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length >= 24);
    });

  return paragraphBlocks.length ? paragraphBlocks : [normalized];
}

export function buildSourceBlocks(sourceSections: SourceSections): SourceBlock[] {
  return (Object.keys(sourceSections) as Array<keyof SourceSections>).flatMap((sourceKey) => {
    const text = sourceSections[sourceKey]?.trim();
    if (!text) {
      return [];
    }

    return splitSourceIntoBlocks(text).map((blockText, index) => ({
      id: `${sourceKey}-${index + 1}`,
      sourceKey,
      sourceLabel: SOURCE_LABELS[sourceKey],
      text: blockText,
      normalizedText: normalizeText(blockText),
      tokens: unique(tokenize(blockText)),
    }));
  });
}

function scoreBlock(section: ParsedDraftSection, sectionTokens: string[], block: SourceBlock) {
  const overlapTerms = sectionTokens.filter((token) => block.tokens.includes(token));
  const overlapRatio = overlapTerms.length / Math.max(sectionTokens.length, 1);

  let phraseBonus = 0;
  for (const phrase of [
    'passive si',
    'poor sleep',
    'side effects',
    'hopeless statements',
    'poor insight',
    'not stable',
    'safe for discharge',
    'continue inpatient',
  ]) {
    if (section.body.toLowerCase().includes(phrase) && block.normalizedText.includes(phrase)) {
      phraseBonus += 0.18;
    }
  }

  const headingBonus = blockPriority(block.sourceKey, section.heading);
  const score = Math.max(0, overlapRatio + phraseBonus + headingBonus + instructionLanePenalty(block));

  return {
    score,
    overlapTerms: unique(overlapTerms).slice(0, 8),
  };
}

function signalForScore(score: number): SectionEvidenceLink['signal'] {
  if (score >= 0.62) {
    return 'strong-overlap';
  }
  if (score >= 0.34) {
    return 'possible-overlap';
  }
  return 'weak-overlap';
}

function splitDraftSectionIntoSentences(body: string) {
  const normalized = body.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return [];
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+(?=["'A-Z0-9])|;\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 24);

  if (sentences.length) {
    return sentences;
  }

  return normalized.length >= 24 ? [normalized] : [];
}

export function buildSectionEvidenceMap(sections: ParsedDraftSection[], sourceSections: SourceSections): SectionEvidenceMap {
  const blocks = buildSourceBlocks(sourceSections);

  return Object.fromEntries(
    sections.map((section) => {
      const sectionTerms = unique(tokenize(`${section.heading} ${section.body}`)).slice(0, 14);
      const links = blocks
        .map((block) => {
          const { score, overlapTerms } = scoreBlock(section, sectionTerms, block);
          return {
            blockId: block.id,
            score,
            overlapTerms,
            signal: signalForScore(score),
          } satisfies SectionEvidenceLink;
        })
        .filter((link) => link.score >= 0.2 && link.overlapTerms.length > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 4);

      return [
        section.anchor,
        {
          sectionAnchor: section.anchor,
          sectionHeading: section.heading,
          sectionTerms,
          links,
        },
      ];
    }),
  );
}

export function buildSectionSentenceEvidenceMap(
  sections: ParsedDraftSection[],
  sourceSections: SourceSections,
  maxSentencesPerSection = 3,
): SectionSentenceEvidenceMap {
  const blocks = buildSourceBlocks(sourceSections);

  return Object.fromEntries(
    sections.map((section) => {
      const sentenceEvidence = splitDraftSectionIntoSentences(section.body)
        .slice(0, 8)
        .map((sentence, index) => {
          const sentenceTerms = unique(tokenize(`${section.heading} ${sentence}`)).slice(0, 14);
          const links = blocks
            .map((block) => {
              const { score, overlapTerms } = scoreBlock({ ...section, body: sentence }, sentenceTerms, block);
              return {
                blockId: block.id,
                score,
                overlapTerms,
                signal: signalForScore(score),
              } satisfies SectionEvidenceLink;
            })
            .filter((link) => link.score >= 0.18 && link.overlapTerms.length > 0)
            .sort((left, right) => right.score - left.score)
            .slice(0, 3);

          return {
            id: `${section.anchor}-sentence-${index + 1}`,
            sectionAnchor: section.anchor,
            sectionHeading: section.heading,
            sentence,
            links,
          } satisfies SectionSentenceEvidence;
        })
        .filter((item) => item.links.length > 0)
        .sort((left, right) => (right.links[0]?.score || 0) - (left.links[0]?.score || 0))
        .slice(0, maxSentencesPerSection);

      return [section.anchor, sentenceEvidence];
    }),
  );
}

export function getSignalLabel(signal: SectionEvidenceLink['signal']) {
  if (signal === 'strong-overlap') {
    return 'Stronger lexical overlap';
  }
  if (signal === 'possible-overlap') {
    return 'Possible support';
  }
  return 'Weak clue only';
}

export function buildSourceTraceSummary(
  sections: ParsedDraftSection[],
  sourceSections: SourceSections,
): SourceTraceSummary {
  const sourceBlocks = buildSourceBlocks(sourceSections);
  const sectionMap = buildSectionEvidenceMap(sections, sourceSections);
  const sentenceMap = buildSectionSentenceEvidenceMap(sections, sourceSections, 8);
  const sourceCounts = new Map<string, number>();
  let linkedSentenceCount = 0;
  let strongSentenceCount = 0;
  let possibleSentenceCount = 0;
  let weakSentenceCount = 0;

  for (const rows of Object.values(sentenceMap)) {
    for (const row of rows) {
      const primary = row.links[0];
      if (!primary) {
        continue;
      }

      linkedSentenceCount += 1;
      if (primary.signal === 'strong-overlap') {
        strongSentenceCount += 1;
      } else if (primary.signal === 'possible-overlap') {
        possibleSentenceCount += 1;
      } else {
        weakSentenceCount += 1;
      }

      for (const link of row.links) {
        const block = sourceBlocks.find((item) => item.id === link.blockId);
        if (block) {
          sourceCounts.set(block.sourceLabel, (sourceCounts.get(block.sourceLabel) || 0) + 1);
        }
      }
    }
  }

  const linkedSectionCount = sections.filter((section) => (sectionMap[section.anchor]?.links.length || 0) > 0).length;
  const unsupportedSectionCount = sections.filter((section) => section.body.trim() && !(sectionMap[section.anchor]?.links.length)).length;
  const sourceUsage = Array.from(sourceCounts.entries())
    .map(([sourceLabel, count]) => ({ sourceLabel, count }))
    .sort((left, right) => right.count - left.count || left.sourceLabel.localeCompare(right.sourceLabel));

  return {
    sectionCount: sections.length,
    linkedSectionCount,
    linkedSentenceCount,
    strongSentenceCount,
    possibleSentenceCount,
    weakSentenceCount,
    unsupportedSectionCount,
    linkedSourceLabels: sourceUsage.map((item) => item.sourceLabel),
    sourceUsage,
  };
}

export function highlightTermsInText(text: string, terms: string[]) {
  const filteredTerms = unique(terms).filter((term) => term.length >= 3);

  if (!filteredTerms.length) {
    return [{ text, highlighted: false }];
  }

  const pattern = new RegExp(`(${filteredTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  const parts = text.split(pattern).filter((part) => part.length > 0);

  return parts.map((part) => ({
    text: part,
    highlighted: filteredTerms.some((term) => term.toLowerCase() === part.toLowerCase()),
  }));
}
