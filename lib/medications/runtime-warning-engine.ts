import type {
  EmittedMedicationWarning,
  MedicationRuntimeInput,
  MedicationWarningBundle,
  MedicationWarningRuleSeed,
} from '@/types/medication-warning';

const SEVERITY_ORDER = {
  hard_stop: 0,
  major: 1,
  moderate: 2,
  info: 3,
} as const;

function hasAnyMedicationMatch(rule: MedicationWarningRuleSeed, input: MedicationRuntimeInput) {
  const active = new Set(input.activeMedicationIds);
  const recent = new Set(input.recentMedicationIds || []);
  const activeTags = new Set(input.activeMedicationTags || []);
  const recentTags = new Set(input.recentMedicationTags || []);
  const hasMedicationIdMatch =
    !rule.medicationIds.length
    || rule.medicationIds.some((item) => active.has(item) || recent.has(item));
  const hasMedicationTagMatch =
    !rule.medicationTags.length
    || rule.medicationTags.some((item) => activeTags.has(item) || recentTags.has(item));

  return hasMedicationIdMatch && hasMedicationTagMatch;
}

function collectMissingInputs(rule: MedicationWarningRuleSeed, input: MedicationRuntimeInput) {
  return rule.contextInputs.filter((key) => input.context[key] === undefined || input.context[key] === null || input.context[key] === '');
}

function shouldEmitRule(rule: MedicationWarningRuleSeed, input: MedicationRuntimeInput) {
  if (!hasAnyMedicationMatch(rule, input)) {
    return false;
  }

  for (const [key, value] of Object.entries(rule.filters)) {
    if (String(input.context[key] ?? '').toLowerCase() !== String(value).toLowerCase()) {
      return false;
    }
  }

  return true;
}

function buildWarning(rule: MedicationWarningRuleSeed, input: MedicationRuntimeInput): EmittedMedicationWarning {
  const missingInputs = collectMissingInputs(rule, input);
  const requiresClinicianReview = true;
  const downgradedSeverity =
    rule.severity === 'hard_stop' && missingInputs.length
      ? 'major'
      : rule.severity;

  return {
    code: rule.ruleId,
    severity: downgradedSeverity,
    title: rule.ruleId.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase()),
    summary: rule.actionSummary,
    whyTriggered: [
      rule.triggerDescription,
      ...(missingInputs.length ? [`Missing context: ${missingInputs.join(', ')}`] : []),
    ],
    actions: [
      'Treat as review support, not autonomous prescribing guidance.',
      ...(rule.actionSummary ? [rule.actionSummary] : []),
    ],
    evidenceBasis: rule.evidenceBasis,
    sourceDocumentIds: rule.sourceDocumentIds,
    medicationIds: rule.medicationIds.filter((item) => input.activeMedicationIds.includes(item) || (input.recentMedicationIds || []).includes(item)),
    missingInputs,
    requiresClinicianReview,
    provisional: rule.provisional,
  };
}

export function evaluateMedicationWarnings(bundle: MedicationWarningBundle, input: MedicationRuntimeInput) {
  return bundle.rules
    .filter((rule) => shouldEmitRule(rule, input))
    .map((rule) => buildWarning(rule, input));
}

export function evaluateMedicationWarningsSorted(bundle: MedicationWarningBundle, input: MedicationRuntimeInput) {
  return evaluateMedicationWarnings(bundle, input).sort(
    (left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity],
  );
}
