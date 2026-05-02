export type AssistantReasoningExposureMode = 'default' | 'clarification' | 'deep';

const DEEP_REASONING_CUES = [
  /\bwalk me through (?:the )?reasoning\b/i,
  /\bexplain (?:it )?step[-\s]?by[-\s]?step\b/i,
  /\bdifferential diagnosis\b/i,
  /\bwhy not\b.*\b(diagnosis|bipolar|mania|mdd|depression|schizophrenia|psychosis|ptsd|panic|gad|adhd|autism|personality|delirium|dementia)\b/i,
  /\bwhy (?:is this|isn't this|is this not)\b.*\b(diagnosis|bipolar|mania|mdd|depression|schizophrenia|psychosis|ptsd|panic|gad|adhd|autism|personality|delirium|dementia)\b/i,
];

const CLARIFICATION_CUES = [
  /\bwhat am i missing\b/i,
  /\bwhat else (?:am i missing|should i consider|matters)\b/i,
  /\bwhy\b/i,
  /\bhelp me think\b/i,
];

function normalizeMessage(message: string) {
  return message.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

function matchesAny(message: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(message));
}

export function detectReasoningExposureMode(
  message: string,
  options: {
    diagnosticSafetyTriggered?: boolean;
    ambiguousOrIncompleteScenario?: boolean;
  } = {},
): AssistantReasoningExposureMode {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return 'default';
  }

  if (matchesAny(normalized, DEEP_REASONING_CUES)) {
    return 'deep';
  }

  if (
    options.diagnosticSafetyTriggered
    || options.ambiguousOrIncompleteScenario
    || matchesAny(normalized, CLARIFICATION_CUES)
  ) {
    return 'clarification';
  }

  return 'default';
}

export function formatStructuredReasoningHints(items: string[], maxItems = 4) {
  const uniqueItems = Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
  if (!uniqueItems.length) {
    return '';
  }

  return `Consider: ${uniqueItems.slice(0, maxItems).join('; ')}.`;
}
