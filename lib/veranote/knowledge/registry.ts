import type {
  DiagnosisCodingEntry,
  DiagnosisConcept,
  EmergingDrugConcept,
  KnowledgeBundle,
  KnowledgeIntent,
  KnowledgeQuery,
  ProviderMemoryItem,
  PsychMedicationConcept,
  TrustedReference,
  WorkflowGuidance,
} from '@/lib/veranote/knowledge/types';

export type KnowledgeRegistry = {
  diagnosisConcepts: DiagnosisConcept[];
  codingEntries: DiagnosisCodingEntry[];
  medicationConcepts: PsychMedicationConcept[];
  emergingDrugConcepts: EmergingDrugConcept[];
  workflowGuidance: WorkflowGuidance[];
  trustedReferences: TrustedReference[];
  memoryItems: ProviderMemoryItem[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function containsTerm(text: string, candidate: string) {
  const normalizedText = ` ${normalize(text)} `;
  const normalizedCandidate = normalize(candidate);
  return normalizedCandidate ? normalizedText.includes(` ${normalizedCandidate} `) : false;
}

function scoreAliases(text: string, aliases: string[]) {
  return aliases.reduce((best, alias) => {
    if (!containsTerm(text, alias)) {
      return best;
    }
    return Math.max(best, normalize(alias).length + 10);
  }, 0);
}

function limit<T>(items: T[], max = 4) {
  return items.slice(0, max);
}

function selectByIntent(registry: KnowledgeRegistry, intent: KnowledgeIntent) {
  switch (intent) {
    case 'coding_help':
      return ['diagnosisConcepts', 'codingEntries'] as const;
    case 'diagnosis_help':
      return ['diagnosisConcepts', 'codingEntries'] as const;
    case 'medication_help':
      return ['medicationConcepts'] as const;
    case 'substance_help':
      return ['emergingDrugConcepts'] as const;
    case 'clinical_mse_help':
      return [] as const;
    case 'workflow_help':
      return ['workflowGuidance'] as const;
    case 'reference_help':
      return ['trustedReferences'] as const;
    case 'draft_support':
    default:
      return ['diagnosisConcepts', 'medicationConcepts', 'emergingDrugConcepts', 'workflowGuidance'] as const;
  }
}

export function queryKnowledgeRegistry(registry: KnowledgeRegistry, query: KnowledgeQuery): KnowledgeBundle {
  const limitCount = query.limitPerDomain || query.limit || 4;
  const text = query.text || '';
  const included = new Set(selectByIntent(registry, query.intent));

  const diagnosisConcepts = included.has('diagnosisConcepts')
    ? limit(
      [...registry.diagnosisConcepts]
        .map((item) => ({ item, score: scoreAliases(text, item.aliases) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((entry) => entry.item),
      limitCount,
    )
    : [];

  const codingEntries = included.has('codingEntries')
    ? limit(
      [...registry.codingEntries]
        .map((item) => ({ item, score: scoreAliases(text, item.aliases) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((entry) => entry.item),
      limitCount,
    )
    : [];

  const medicationConcepts = included.has('medicationConcepts')
    ? limit(
      [...registry.medicationConcepts]
        .map((item) => ({ item, score: scoreAliases(text, item.aliases) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((entry) => entry.item),
      limitCount,
    )
    : [];

  const emergingDrugConcepts = included.has('emergingDrugConcepts')
    ? limit(
      [...registry.emergingDrugConcepts]
        .map((item) => ({ item, score: scoreAliases(text, [...item.aliases, ...item.streetNames]) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((entry) => entry.item),
      limitCount,
    )
    : [];

  const workflowGuidance = included.has('workflowGuidance')
    ? limit(
      [...registry.workflowGuidance]
        .map((item) => ({ item, score: scoreAliases(text, item.aliases) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((entry) => entry.item),
      limitCount,
    )
    : [];

  const trustedReferences = (included.has('trustedReferences') || query.includeReferences)
    ? limit(
      [...registry.trustedReferences]
        .map((item) => ({ item, score: scoreAliases(text, item.aliases) + scoreAliases(text, item.categories) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .map((entry) => entry.item),
      limitCount,
    )
    : [];

  return {
    query,
    matchedIntents: [query.intent],
    diagnosisConcepts,
    codingEntries,
    medicationConcepts,
    emergingDrugConcepts,
    workflowGuidance,
    trustedReferences,
    memoryItems: query.includeMemory ? limit(registry.memoryItems, limitCount) : [],
  };
}
