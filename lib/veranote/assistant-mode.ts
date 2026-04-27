import type { AssistantMode, AssistantModeMeta, AssistantStage } from '@/types/assistant';

export type AssistantThreadResponseStyle = 'full' | 'tight' | 'one-line';

export type AssistantFollowupDirective = {
  preserveClinicalState: boolean;
  responseStyle: AssistantThreadResponseStyle;
  direct: boolean;
  binaryShortcut: boolean;
};

export const ASSISTANT_ENABLED = process.env.NEXT_PUBLIC_VERANOTE_ASSISTANT_ENABLED !== 'false';

type AssistantModeDefinition = {
  mode: AssistantMode;
  label: string;
  shortLabel: string;
  detail: string;
  stagePrompt: Partial<Record<AssistantStage, string>>;
};

const ASSISTANT_MODE_DEFINITIONS: Record<AssistantMode, AssistantModeDefinition> = {
  'workflow-help': {
    mode: 'workflow-help',
    label: 'Workflow help',
    shortLabel: 'Workflow',
    detail: 'Calm, source-first guidance inside the current Veranote workflow.',
    stagePrompt: {
      compose: 'Direct, psych-first help for setup, drafting, and section work.',
      review: 'Direct, source-faithful help for warning review, revision, and provenance.',
    },
  },
  'prompt-builder': {
    mode: 'prompt-builder',
    label: 'Prompt builder',
    shortLabel: 'Preferences',
    detail: 'Reusable note-lane and preset guidance without drifting into patient-specific drafting.',
    stagePrompt: {
      compose: 'Reusable note-lane guidance for presets and provider preferences.',
      review: 'Reusable review patterns and provider-approved preference drafting from repeat edits.',
    },
  },
  'reference-lookup': {
    mode: 'reference-lookup',
    label: 'Reference lookup',
    shortLabel: 'Reference',
    detail: 'Trusted reference help with answer-first, minimal-caveat responses kept separate from note drafting.',
    stagePrompt: {
      compose: 'Trusted reference help using approved sources when available.',
      review: 'Trusted reference help kept separate from draft evidence and note revision decisions.',
    },
  },
};

export function getAssistantModeDefinition(mode: AssistantMode) {
  return ASSISTANT_MODE_DEFINITIONS[mode];
}

export function listAssistantModeDefinitions() {
  return Object.values(ASSISTANT_MODE_DEFINITIONS);
}

export function buildAssistantModeMeta(mode: AssistantMode, stage: AssistantStage): AssistantModeMeta {
  const definition = getAssistantModeDefinition(mode);

  return {
    mode,
    label: definition.label,
    shortLabel: definition.shortLabel,
    detail: definition.stagePrompt[stage] || definition.detail,
  };
}

export function classifyClinicalFollowupDirective(message: string): AssistantFollowupDirective {
  const normalized = message.trim().toLowerCase();

  const oneLine = [
    /\bone line\b/,
    /\bone sentence\b/,
    /\bshort version only\b/,
    /\bjust give me the sentence\b/,
    /\bjust the sentence\b/,
    /\bjust give me one line\b/,
  ].some((pattern) => pattern.test(normalized));

  const tight = oneLine || [
    /\bshorter\b/,
    /\btighter\b/,
    /\bmake that tighter\b/,
    /\bmake it tighter\b/,
    /\bno, tighter than that\b/,
    /\bone paragraph\b/,
    /\brewrite\b/,
    /\bword this better\b/,
    /\bimprove this note\b/,
    /\bnot fake-clean\b/,
    /\bmake that usable\b/,
    /\bmake it usable\b/,
    /\bmake it chart(?:-|\s)?ready\b/,
    /\bmake that legally safer wording\b/,
    /\bmake it legally safer wording\b/,
    /\blegally safer wording\b/,
    /\bgive me the warning language\b/,
    /\bgive me chart(?:-|\s)?ready wording instead\b/,
    /\bmake that chart(?:-|\s)?ready\b/,
    /\binclude what is missing\b/,
    /\badd conservative summary\b/,
    /\bavoid overcalling\b/,
    /\bsame facts only\b/,
    /\bdon'?t mention means not assessed\b/,
  ].some((pattern) => pattern.test(normalized));

  const direct = [
    /\bbe direct\b/,
    /\bjust say\b/,
    /\bcan i just write\b/,
    /\bcan i just say\b/,
    /\bjust call it\b/,
    /\bpick one\b/,
  ].some((pattern) => pattern.test(normalized));

  const binaryShortcut = [
    /\bjust say yes or no\b/,
    /\bdoes he have capacity or not\b/,
    /\bdoes this meet hold\b/,
    /\bpick one\b/,
  ].some((pattern) => pattern.test(normalized));

  const preserveClinicalState = tight || direct || binaryShortcut;

  return {
    preserveClinicalState,
    responseStyle: oneLine ? 'one-line' : tight ? 'tight' : 'full',
    direct,
    binaryShortcut,
  };
}
