import OpenAI from 'openai';
import { buildFidelityDirectives, extractExplicitDates, summarizeSourceConstraints } from '@/lib/ai/source-analysis';

type RewriteMode = 'more-concise' | 'more-formal' | 'closer-to-source' | 'regenerate-full-note';

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
