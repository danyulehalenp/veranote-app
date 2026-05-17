import OpenAI from 'openai';
import { buildFidelityDirectives, extractExplicitDates, summarizeSourceConstraints } from '@/lib/ai/source-analysis';

export const REWRITE_MODES = [
  'more-concise',
  'more-formal',
  'closer-to-source',
  'regenerate-full-note',
  'one-paragraph',
  'two-paragraph-hpi-mse-plan',
  'story-flow',
] as const;

export type RewriteMode = (typeof REWRITE_MODES)[number];

type RewriteInput = {
  sourceInput: string;
  currentDraft: string;
  noteType: string;
  rewriteMode: RewriteMode;
};

export type RewriteResult = {
  note: string;
  mode: 'live' | 'fallback';
  warning?: string;
};

const COMMON_DRAFT_HEADINGS = [
  /^hpi$/i,
  /^history of present illness$/i,
  /^interval(?: history| update)?$/i,
  /^subjective$/i,
  /^objective$/i,
  /^mse$/i,
  /^mental status(?: exam(?:ination)?)?$/i,
  /^assessment$/i,
  /^plan$/i,
  /^assessment\s*(?:and|&|\/)\s*plan$/i,
  /^a\/p$/i,
  /^risk(?: assessment)?$/i,
  /^safety(?: \/ risk| and risk)?$/i,
  /^diagnos(?:is|es)$/i,
  /^impression$/i,
];

function normalizePotentialHeading(line: string) {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[\t ]*[•▪◦●○*-]\s+/, '')
    .replace(/^[\t ]*\d+[.)]\s+/, '')
    .replace(/:$/, '')
    .trim();
}

function isLikelyHeading(line: string) {
  const trimmed = line.trim();
  const normalized = normalizePotentialHeading(trimmed);
  if (!normalized) {
    return false;
  }

  if (COMMON_DRAFT_HEADINGS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (/^#{1,6}\s+\S/.test(trimmed)) {
    return normalized.split(/\s+/).length <= 8;
  }

  if (
    trimmed.endsWith(':')
    && /^[A-Z][A-Za-z0-9 /&(),'-]{1,80}:$/.test(trimmed.replace(/^#{1,6}\s+/, ''))
    && !/[.!?]$/.test(normalized)
  ) {
    return true;
  }

  return normalized.length <= 60
    && normalized.split(/\s+/).length <= 6
    && normalized === normalized.toUpperCase()
    && /[A-Z]/.test(normalized);
}

function stripListMarker(line: string) {
  return line
    .replace(/^[\t ]*[•▪◦●○*-]\s+/, '')
    .replace(/^[\t ]*\d+[.)]\s+/, '')
    .trim();
}

function splitInlineHeading(line: string) {
  const match = line.match(/^(?:#{1,6}\s+)?([A-Za-z][A-Za-z0-9 /&(),'-]{1,60}):\s+(.+)$/);
  if (!match?.[1] || !match[2]?.trim()) {
    return null;
  }

  const heading = normalizePotentialHeading(match[1]);
  if (!isLikelyHeading(`${heading}:`)) {
    return null;
  }

  return {
    heading,
    body: stripListMarker(match[2]),
  };
}

function splitDraftIntoSectionBodies(draft: string) {
  const lines = draft.replace(/\r\n/g, '\n').split('\n');
  const sections: Array<{ heading: string; body: string }> = [];
  let currentHeading = 'Narrative';
  let currentLines: string[] = [];

  function flush() {
    const body = currentLines.join(' ').replace(/\s+/g, ' ').trim();
    if (body) {
      sections.push({ heading: currentHeading, body });
    }
    currentLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const inlineHeading = splitInlineHeading(line);
    if (inlineHeading) {
      flush();
      currentHeading = inlineHeading.heading;
      currentLines.push(inlineHeading.body);
      continue;
    }

    if (isLikelyHeading(line)) {
      flush();
      currentHeading = normalizePotentialHeading(line);
      continue;
    }

    currentLines.push(stripListMarker(line));
  }

  flush();
  return sections.length ? sections : [{ heading: 'Narrative', body: draft.replace(/\s+/g, ' ').trim() }];
}

function toOneParagraph(draft: string) {
  return splitDraftIntoSectionBodies(draft)
    .map((section) => section.body)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTwoParagraphHpiMsePlan(draft: string) {
  const sections = splitDraftIntoSectionBodies(draft);
  const firstParagraph = sections
    .filter((section) => /hpi|subjective|interval|history|chief|reason|narrative/i.test(section.heading))
    .map((section) => section.body);
  const secondParagraph = sections
    .filter((section) => /mse|mental|risk|assessment|impression|plan|medication|follow|safety/i.test(section.heading))
    .map((section) => section.body);
  const used = new Set([...firstParagraph, ...secondParagraph]);
  const remaining = sections.map((section) => section.body).filter((body) => !used.has(body));

  const first = (firstParagraph.length ? firstParagraph : remaining.splice(0, Math.ceil(remaining.length / 2)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const second = [...secondParagraph, ...remaining]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return [first, second].filter(Boolean).join('\n\n');
}

function fallbackRewrite(input: RewriteInput): string {
  switch (input.rewriteMode) {
    case 'more-concise':
      return input.currentDraft
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/\s+/g, ' '))
        .join('\n\n');
    case 'more-formal':
      return input.currentDraft
        .replace(/\bpt\b/gi, 'patient')
        .replace(/\bSI\b/g, 'suicidal ideation')
        .replace(/\bHI\b/g, 'homicidal ideation');
    case 'closer-to-source':
      return `Source-shaped draft:\n\n${input.sourceInput}`;
    case 'one-paragraph':
      return toOneParagraph(input.currentDraft);
    case 'two-paragraph-hpi-mse-plan':
      return toTwoParagraphHpiMsePlan(input.currentDraft);
    case 'story-flow':
      return toOneParagraph(input.currentDraft);
    case 'regenerate-full-note':
    default:
      return input.currentDraft;
  }
}

function instructionForMode(mode: RewriteMode) {
  switch (mode) {
    case 'more-concise':
      return 'Rewrite the note to be more concise while preserving all supported clinical facts, dates, and uncertainty. Do not add new content or smooth away clinically meaningful roughness.';
    case 'more-formal':
      return 'Rewrite the note to sound slightly more formal and clinically polished while preserving all supported facts, direct source meaning, dates, and uncertainty. Do not add new content.';
    case 'closer-to-source':
      return 'Rewrite the note so it stays much closer to the original source wording and structure while remaining readable. Reduce interpretation, preserve direct phrasing where usable, and do not add new content.';
    case 'one-paragraph':
      return 'Rewrite the current draft into one coherent clinical paragraph. Remove section headings, preserve all source-supported facts and uncertainty, and do not add new clinical content.';
    case 'two-paragraph-hpi-mse-plan':
      return 'Rewrite the draft into exactly two paragraphs when possible: paragraph one for HPI/interval narrative, paragraph two for MSE, assessment, risk, and plan. Preserve source-supported facts and uncertainty only.';
    case 'story-flow':
      return 'Rewrite the draft so it flows like a clinical story while staying concise, source-faithful, and chart-ready. Remove bulky section scaffolding unless headings are necessary for safety.';
    case 'regenerate-full-note':
    default:
      return 'Regenerate the note as a cleaner full draft using only the supported facts from the source input. Preserve dates, preserve uncertainty, and do not invent content. If the current draft contains unsupported statements, remove them rather than replacing them with new inference.';
  }
}

function buildRewriteDirectives(input: RewriteInput) {
  const directives = buildFidelityDirectives(input.sourceInput, input.rewriteMode === 'closer-to-source');
  const explicitDates = extractExplicitDates(input.sourceInput);
  const constraints = summarizeSourceConstraints(input.sourceInput);

  if (explicitDates.length) {
    directives.push(`Do not drop or normalize these explicit dates: ${explicitDates.join(', ')}.`);
  }

  if (input.rewriteMode === 'closer-to-source') {
    directives.push('Prefer minimal cleanup. If the current draft over-interprets the source, pull it back toward the source language.');
  }

  if (constraints.sourceHasTimelineAnchors) {
    directives.push('Preserve timeline anchors and old-versus-current distinctions exactly enough that historical symptoms do not become current ones.');
  }

  if (constraints.sourceHasPartialImprovementLanguage) {
    directives.push('Preserve partial or qualified improvement wording. Do not rewrite it into stability, resolution, or broad control.');
  }

  if (constraints.sourceHasPassiveDeathWishNuance) {
    directives.push('Keep passive death-wish language paired with denial of active plan or intent. Do not collapse it into either a clean suicidality denial or active SI wording.');
  }

  if (constraints.sourceHasViolenceRiskNuance) {
    directives.push('Keep the distinction between violent thoughts/fantasies and denial of active intent or plan.');
  }

  if (constraints.sourceHasObjectiveNarrativeMismatch) {
    directives.push('Do not let narrative cleanup erase conflicting objective/chart/staff data. Preserve both sides with explicit attribution when needed.');
  }

  directives.push('If any current-draft sentence is not clearly supported by source input, delete or soften it instead of rewriting it into a different unsupported claim.');
  directives.push('For medication content, preserve unresolved conflicts across patient report, chart med list, MAR, and prior plan instead of reconciling them into one clean regimen.');
  directives.push('Do not strengthen medication adherence, refill, side-effect, continuation, restart, increase, decrease, or stop language beyond what the source explicitly supports.');

  return directives.join(' ');
}

export async function rewriteNote(input: RewriteInput): Promise<RewriteResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  if (!apiKey) {
    return {
      note: fallbackRewrite(input),
      mode: 'fallback',
      warning: 'No OpenAI API key found, so the app used a local fallback rewrite.',
    };
  }

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model,
      temperature: 0,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'You are rewriting a clinical draft note. Preserve supported facts, dates, source meaning, and uncertainty. Do not invent or infer new clinical content. Keep the voice source-faithful and clinically restrained. Return only the rewritten note text with no commentary.',
            },
          ],
        },
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: `${instructionForMode(input.rewriteMode)} ${buildRewriteDirectives(input)}`,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                noteType: input.noteType,
                sourceInput: input.sourceInput,
                currentDraft: input.currentDraft,
              }),
            },
          ],
        },
      ],
    });

    return {
      note: response.output_text.trim(),
      mode: 'live',
    };
  } catch (error) {
    const warning = error instanceof Error ? error.message : 'Live rewrite was unavailable, so the app used a local fallback rewrite.';
    return {
      note: fallbackRewrite(input),
      mode: 'fallback',
      warning,
    };
  }
}
