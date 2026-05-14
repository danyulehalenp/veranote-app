export const PROMPT_STUDIO_GOAL_OPTIONS = [
  {
    id: 'one-paragraph-follow-up',
    label: 'One-paragraph follow-up',
    instruction: 'For follow-up notes, use one polished paragraph when the provider asks for paragraph style, without dropping risk, MSE, medication response, or plan details that are source-supported.',
  },
  {
    id: 'two-paragraph-story',
    label: 'Two-paragraph story',
    instruction: 'When narrative flow is preferred, put HPI/interval history in the first paragraph, then MSE, assessment, safety, and plan in the second paragraph.',
  },
  {
    id: 'sectioned-ehr-copy',
    label: 'EHR copy sections',
    instruction: 'Keep output easy to copy into EHR fields with clear section boundaries and minimal decorative formatting.',
  },
  {
    id: 'preserve-source-uncertainty',
    label: 'Preserve uncertainty',
    instruction: 'Preserve uncertainty, source limits, pending data, and unresolved contradictions instead of smoothing them into confident language.',
  },
  {
    id: 'preserve-risk-conflict',
    label: 'Risk conflict visible',
    instruction: 'For risk language, keep patient denial, collateral concern, observed behavior, and clinician assessment distinct when they differ.',
  },
  {
    id: 'do-not-fill-mse',
    label: 'No invented MSE',
    instruction: 'Do not fill normal MSE elements unless they are directly supported by source material.',
  },
  {
    id: 'short-plan',
    label: 'Short plan',
    instruction: 'Keep the plan short, scannable, and limited to source-supported next steps; do not invent orders, medication changes, or follow-up details.',
  },
  {
    id: 'medical-psych-confounders',
    label: 'Medical/psych confounders',
    instruction: 'Keep medical, substance, medication, and collateral confounders visible when they affect diagnostic or safety wording.',
  },
] as const;

export type ProviderPromptStudioGoalId = (typeof PROMPT_STUDIO_GOAL_OPTIONS)[number]['id'];

export type ProviderPromptSafetyWarning = {
  id: string;
  label: string;
  detail: string;
  severity: 'review' | 'caution';
};

type ProviderPromptStudioInput = {
  noteType: string;
  specialty: string;
  outputDestination: string;
  selectedGoalIds: ProviderPromptStudioGoalId[];
  freeText?: string;
};

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function cleanLine(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    .trim();
}

export function sanitizeProviderPromptName(value: string, fallback = 'My Note Prompt') {
  const cleaned = cleanLine(value)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 72)
    .trim();

  return cleaned || fallback;
}

export function getPromptStudioGoalOptions(noteType: string) {
  const normalizedNoteType = noteType.toLowerCase();

  if (/therapy|dap|birp/i.test(normalizedNoteType)) {
    return PROMPT_STUDIO_GOAL_OPTIONS.filter((option) => option.id !== 'medical-psych-confounders');
  }

  if (/discharge/i.test(normalizedNoteType)) {
    return PROMPT_STUDIO_GOAL_OPTIONS.filter((option) => option.id !== 'one-paragraph-follow-up');
  }

  return PROMPT_STUDIO_GOAL_OPTIONS;
}

export function buildProviderPromptStudioDraft(input: ProviderPromptStudioInput) {
  const selectedGoalIds = unique(input.selectedGoalIds);
  const goals = PROMPT_STUDIO_GOAL_OPTIONS.filter((option) => selectedGoalIds.includes(option.id));
  const destination = input.outputDestination && input.outputDestination !== 'Generic'
    ? input.outputDestination
    : 'the selected EHR or copy/paste destination';
  const lines = [
    `Reusable prompt for ${input.noteType}: control structure, tone, section order, and source-safety behavior only.`,
    `Destination: format cleanly for ${destination} without changing clinical meaning.`,
    `Clinical lane: ${input.specialty || 'Clinical documentation'}; keep the note source-faithful and clinician-review ready.`,
  ];

  if (goals.length) {
    lines.push('Selected note goals:');
    goals.forEach((goal) => {
      lines.push(`- ${goal.instruction}`);
    });
  } else {
    lines.push('Selected note goals: keep the note organized, source-close, clinically concise, and ready for clinician review.');
  }

  lines.push(
    'Safety guardrails:',
    '- Patient-specific facts, quotes, diagnoses, medications, labs, and risk details belong in the source boxes, not inside this reusable prompt.',
    '- Do not infer normal findings, discharge readiness, diagnosis, medication changes, or billing level when the source does not support them.',
    '- If source material is thin, conflicting, scanned/OCR-limited, or misspelled, preserve the uncertainty and correct only obvious spelling noise when meaning is clear.',
  );

  const freeText = cleanLine(input.freeText || '');
  if (freeText) {
    lines.push(`Provider preference to incorporate: ${freeText}`);
  }

  return lines.join('\n');
}

export function analyzeProviderPromptDraft(value: string): ProviderPromptSafetyWarning[] {
  const text = value.trim();
  const lowered = text.toLowerCase();
  const warnings: ProviderPromptSafetyWarning[] = [];

  if (!text) {
    return warnings;
  }

  if (/\b(mrn|medical record number|ssn|social security|dob|date of birth)\b/i.test(text) || /\b\d{3}[-.\s]\d{2}[-.\s]\d{4}\b/.test(text) || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) || /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(text)) {
    warnings.push({
      id: 'possible-phi',
      label: 'Possible PHI in reusable prompt',
      detail: 'Reusable prompts should not include patient identifiers, dates of birth, MRNs, phone numbers, email addresses, or copied chart text.',
      severity: 'caution',
    });
  }

  if (/\b(patient|client)\s+(is|was|has|had|reports|reported|denies|denied|lives|takes|took|slept|states|stated)\b/i.test(text)) {
    warnings.push({
      id: 'possible-patient-fact',
      label: 'Looks like encounter-specific patient facts',
      detail: 'Keep reusable prompts focused on format and guardrails. Put patient facts in the four source boxes so traceability stays clean.',
      severity: 'review',
    });
  }

  if (/\b(infer|assume|make up|invent|auto[-\s]?complete|fill in|normal mse|no risk|medically cleared|stable for discharge|maximize cpt|highest billing|upcode|prescribe|start medication|increase dose|decrease dose)\b/i.test(lowered)) {
    warnings.push({
      id: 'unsafe-template-instruction',
      label: 'Unsafe reusable instruction',
      detail: 'This prompt may encourage unsupported facts, billing overreach, diagnosis/treatment decisions, or false reassurance. Reword it as source-supported formatting guidance.',
      severity: 'caution',
    });
  }

  if (text.length > 1800) {
    warnings.push({
      id: 'prompt-too-long',
      label: 'Prompt may be too long',
      detail: 'Long reusable prompts are harder to test and can compete with patient source. Prefer concise, versioned instructions.',
      severity: 'review',
    });
  }

  return warnings;
}
