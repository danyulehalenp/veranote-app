import type { AssistantAction, AssistantStage } from '@/types/assistant';

export type AssistantToolRiskLevel = 'read-only' | 'draft' | 'apply';

export type AssistantToolDefinition = {
  type: AssistantAction['type'];
  title: string;
  riskLevel: AssistantToolRiskLevel;
  summary: string;
  allowedStages: AssistantStage[];
};

const ASSISTANT_TOOL_REGISTRY: Record<AssistantAction['type'], AssistantToolDefinition> = {
  'replace-preferences': {
    type: 'replace-preferences',
    title: 'Replace preferences',
    riskLevel: 'draft',
    summary: 'Drafts a new preference block to replace the current note-lane preferences.',
    allowedStages: ['compose', 'review'],
  },
  'append-preferences': {
    type: 'append-preferences',
    title: 'Append preferences',
    riskLevel: 'draft',
    summary: 'Adds a new preference block onto the current note-lane preferences.',
    allowedStages: ['compose', 'review'],
  },
  'create-preset-draft': {
    type: 'create-preset-draft',
    title: 'Create preset draft',
    riskLevel: 'draft',
    summary: 'Builds a reusable preset draft from the current Atlas suggestion.',
    allowedStages: ['compose', 'review'],
  },
  'jump-to-source-evidence': {
    type: 'jump-to-source-evidence',
    title: 'Jump to source evidence',
    riskLevel: 'read-only',
    summary: 'Moves the provider to the source-evidence area without editing the note.',
    allowedStages: ['review'],
  },
  'run-review-rewrite': {
    type: 'run-review-rewrite',
    title: 'Run review rewrite',
    riskLevel: 'draft',
    summary: 'Starts a controlled review rewrite path that still requires provider review.',
    allowedStages: ['review'],
  },
  'apply-conservative-rewrite': {
    type: 'apply-conservative-rewrite',
    title: 'Apply conservative rewrite',
    riskLevel: 'apply',
    summary: 'Applies a focused sentence-level rewrite into the active draft for provider review.',
    allowedStages: ['review'],
  },
  'apply-note-revision': {
    type: 'apply-note-revision',
    title: 'Apply note revision',
    riskLevel: 'apply',
    summary: 'Adds a provider-requested note revision into the current draft.',
    allowedStages: ['review'],
  },
  'send-beta-feedback': {
    type: 'send-beta-feedback',
    title: 'Send beta feedback',
    riskLevel: 'draft',
    summary: 'Creates a structured Atlas-gap feedback item for the beta inbox.',
    allowedStages: ['compose', 'review'],
  },
};

export function getAssistantToolDefinition(action: AssistantAction) {
  return ASSISTANT_TOOL_REGISTRY[action.type];
}

export function getAssistantToolRiskLabel(riskLevel: AssistantToolRiskLevel) {
  if (riskLevel === 'read-only') {
    return 'Read only';
  }

  if (riskLevel === 'apply') {
    return 'Applies to draft';
  }

  return 'Draft suggestion';
}

export function listAssistantToolsForStage(stage: AssistantStage) {
  return Object.values(ASSISTANT_TOOL_REGISTRY).filter((tool) => tool.allowedStages.includes(stage));
}
