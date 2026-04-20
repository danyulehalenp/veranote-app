import type { AssistantApiContext, AssistantMode, AssistantStage, AssistantThreadTurn } from '@/types/assistant';
import { getAssistantModeDefinition } from '@/lib/veranote/assistant-mode';

export type AssistantRequestEnvelope = {
  stage?: AssistantStage;
  mode?: AssistantMode;
  message?: string;
  context?: AssistantApiContext;
  recentMessages?: AssistantThreadTurn[];
};

export function resolveAssistantStage(stage?: string): AssistantStage {
  return stage === 'review' ? 'review' : 'compose';
}

export function resolveAssistantMode(mode?: string): AssistantMode {
  if (mode === 'prompt-builder' || mode === 'reference-lookup' || mode === 'workflow-help') {
    return getAssistantModeDefinition(mode).mode;
  }

  return getAssistantModeDefinition('workflow-help').mode;
}

export function normalizeAssistantMessage(message?: string) {
  return typeof message === 'string' ? message.trim() : '';
}

const INTENT_NORMALIZATION_RULES: Array<[RegExp, string]> = [
  [/\bicd[\s-]?(?:10|ten)\b/g, 'icd 10'],
  [/\bh\s*&\s*p\b/g, 'h&p'],
  [/\bf\s*\/\s*u\b/g, 'follow up'],
  [/\bfollow[\s-]?up\b/g, 'follow up'],
  [/\bfu note\b/g, 'follow-up note'],
  [/\bprog(?:ress)?\s*note\b/g, 'progress note'],
  [/\bpt\b/g, 'patient'],
  [/\bdx\b/g, 'diagnosis'],
  [/\btx\b/g, 'treatment'],
  [/\bhx\b/g, 'history'],
  [/\bmeds\b/g, 'medications'],
  [/\bw\/o\b/g, 'without'],
  [/\bw\/\b/g, 'with '],
  [/\bbtwn\b/g, 'between'],
  [/\bprefs\b/g, 'preferences'],
  [/\bpresests\b/g, 'presets'],
  [/\bpresest\b/g, 'preset'],
  [/\bprefences\b/g, 'preferences'],
  [/\bprefrences\b/g, 'preferences'],
  [/\bpreferenses\b/g, 'preferences'],
  [/\bassesment\b/g, 'assessment'],
  [/\bassessement\b/g, 'assessment'],
  [/\bdiagosis\b/g, 'diagnosis'],
  [/\bdiganosis\b/g, 'diagnosis'],
  [/\bdiagonsis\b/g, 'diagnosis'],
  [/\bmedcation\b/g, 'medication'],
  [/\bmedciation\b/g, 'medication'],
  [/\bprogresss\b/g, 'progress'],
  [/\bprogres\b/g, 'progress'],
  [/\bout\s*paitent\b/g, 'outpatient'],
  [/\bout[\s-]?patient\b/g, 'outpatient'],
  [/\bout[\s-]?pt\b/g, 'outpatient'],
  [/\boutpt\b/g, 'outpatient'],
  [/\bin[\s-]?patient\b/g, 'inpatient'],
  [/\bin[\s-]?pt\b/g, 'inpatient'],
  [/\binpt\b/g, 'inpatient'],
  [/\bwell\s*sky\b/g, 'wellsky'],
];

export function normalizeAssistantIntentText(message?: string) {
  const trimmed = normalizeAssistantMessage(message).toLowerCase();

  if (!trimmed) {
    return '';
  }

  return INTENT_NORMALIZATION_RULES
    .reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), trimmed)
    .replace(/\bfu\b/g, 'follow up')
    .replace(/\bmse\b/g, 'mse')
    .replace(/\bhpi\b/g, 'hpi')
    .replace(/\bpsych\b/g, 'psych')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildAssistantIntentTrace(request: {
  stage: AssistantStage;
  mode: AssistantMode;
  normalizedMessage: string;
  context?: AssistantApiContext;
  recentMessages?: AssistantThreadTurn[];
}) {
  const trace = [
    'boundary',
    'conversation',
    request.mode === 'reference-lookup' ? 'reference-lookup' : 'general-knowledge',
    'privacy-trust',
    'support-training',
    'requested-revision',
    'provenance',
  ];

  if (request.mode === 'prompt-builder') {
    trace.push('prompt-builder');
  } else if (request.stage === 'review') {
    trace.push('direct-review', 'review-scenario', 'unknown-question', 'workflow-help');
  } else {
    trace.push(
      'section-draft',
      'direct-compose',
      'mixed-domain-compose',
      'raw-detail-compose',
      'compose-scenario',
      'unknown-question',
      'workflow-help',
    );
  }

  if (request.context?.topHighRiskWarningTitle) {
    trace.push('warning-aware-context');
  }

  if (request.recentMessages?.length) {
    trace.push('recent-thread-memory');
  }

  if (!request.normalizedMessage) {
    trace.push('empty-message');
  }

  return trace;
}
