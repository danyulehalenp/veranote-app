import type { DictationCommandDefinition } from '@/types/dictation';

export const DEFAULT_DICTATION_COMMANDS: DictationCommandDefinition[] = [
  {
    id: 'safety-check-template',
    label: 'Safety check template',
    spokenPhrases: ['insert safety check', 'insert safety template', 'safety check template'],
    action: 'insert_template',
    scope: 'veranote_source',
    description: 'Adds a source-first safety review scaffold.',
    outputText: [
      'Safety check:',
      '- SI:',
      '- HI:',
      '- Psychosis:',
      '- Protective factors:',
      '- Access to means:',
    ].join('\n'),
  },
  {
    id: 'medication-review-template',
    label: 'Medication review template',
    spokenPhrases: ['insert medication review', 'medication review template', 'insert med review'],
    action: 'insert_template',
    scope: 'veranote_source',
    description: 'Adds a structured medication review scaffold to source notes.',
    outputText: [
      'Medication review:',
      '- Current medications:',
      '- Adherence:',
      '- Side effects:',
      '- Benefit noticed:',
      '- Refill needs:',
    ].join('\n'),
  },
  {
    id: 'assessment-focus-template',
    label: 'Assessment focus template',
    spokenPhrases: ['insert assessment focus', 'assessment focus template', 'start assessment bullets'],
    action: 'insert_template',
    scope: 'veranote_source',
    description: 'Adds a structured assessment scaffold for source capture.',
    outputText: [
      'Assessment focus:',
      '- Main symptoms:',
      '- Functional impact:',
      '- Risk / safety:',
      '- Differential questions:',
      '- Plan considerations:',
    ].join('\n'),
  },
  {
    id: 'next-field',
    label: 'Next field',
    spokenPhrases: ['next field', 'move to next field'],
    action: 'navigate_target',
    scope: 'desktop_overlay',
    description: 'Reserved for the future desktop overlay and EHR field navigation layer.',
  },
];

export function createEmptyDictationCommand(): DictationCommandDefinition {
  return {
    id: `dictation-command-${Math.random().toString(36).slice(2, 10)}`,
    label: 'New command',
    spokenPhrases: [''],
    action: 'insert_template',
    scope: 'veranote_source',
    description: '',
    outputText: '',
  };
}

export function getEffectiveDictationCommands(commands?: DictationCommandDefinition[]) {
  return Array.isArray(commands) && commands.length ? commands : DEFAULT_DICTATION_COMMANDS;
}

function normalizeCommandText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function resolveDictationCommandMatch(
  spokenText: string,
  commands: DictationCommandDefinition[] = DEFAULT_DICTATION_COMMANDS,
) {
  const normalizedSpoken = normalizeCommandText(spokenText);
  if (!normalizedSpoken) {
    return null;
  }

  const match = commands.find((command) => (
    command.spokenPhrases.some((phrase) => normalizeCommandText(phrase) === normalizedSpoken)
  ));

  if (!match) {
    return null;
  }

  return {
    commandId: match.id,
    label: match.label,
    action: match.action,
    scope: match.scope,
    description: match.description,
    outputText: match.outputText,
  };
}
