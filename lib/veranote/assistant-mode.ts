import type { AssistantMode, AssistantModeMeta, AssistantStage } from '@/types/assistant';

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
    detail: 'Note-grounded guidance inside the current Veranote workflow.',
    stagePrompt: {
      compose: 'Note-grounded help for setup, drafting, and section work.',
      review: 'Note-grounded help for warning review, revision, and provenance.',
    },
  },
  'prompt-builder': {
    mode: 'prompt-builder',
    label: 'Prompt builder',
    shortLabel: 'Preferences',
    detail: 'Reusable note-lane and preset guidance rather than patient-specific drafting.',
    stagePrompt: {
      compose: 'Reusable note-lane guidance for presets and preferences.',
      review: 'Reusable review patterns and preference drafting from repeat edits.',
    },
  },
  'reference-lookup': {
    mode: 'reference-lookup',
    label: 'Reference lookup',
    shortLabel: 'Reference',
    detail: 'Trusted reference help kept separate from note-grounded drafting.',
    stagePrompt: {
      compose: 'Trusted reference help using approved external sources when available.',
      review: 'Trusted reference help kept separate from the draft and review evidence.',
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
