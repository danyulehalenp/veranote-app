import medicationLibrarySeed from '@/data/psych-medication-library.seed.json';
import { DIAGNOSIS_CODING_ENTRIES, DIAGNOSIS_CONCEPTS } from '@/lib/veranote/knowledge/diagnosis/diagnosis-concepts';
import { EMERGING_DRUG_CLASSES, EMERGING_DRUG_REFERENCES } from '@/lib/veranote/knowledge/substances/emerging-drug-concepts';
import { queryKnowledgeRegistry, type KnowledgeRegistry } from '@/lib/veranote/knowledge/registry';
import type { KnowledgeQuery, PsychMedicationConcept, TrustedReference, WorkflowGuidance } from '@/lib/veranote/knowledge/types';

function buildMedicationConcepts(): PsychMedicationConcept[] {
  return (medicationLibrarySeed.medications || []).map((medication) => ({
    id: medication.id,
    displayName: medication.displayName,
    genericName: medication.genericName,
    aliases: [
      medication.displayName,
      medication.genericName,
      ...(medication.brandNames || []),
      ...(medication.commonAliases || []),
      ...(medication.commonAbbreviations || []),
    ].filter(Boolean),
    categories: [...(medication.categories || []), medication.seedPrimaryClass, medication.seedSecondaryClass].filter(Boolean),
    documentationCautions: medication.notesForDocumentation || [],
    highRiskFlags: medication.highRiskFlags || [],
    authority: 'structured-database',
    useMode: 'suggestive-only',
    evidenceConfidence: medication.provisional ? 'moderate' : 'high',
    reviewStatus: medication.provisional ? 'provisional' : 'seeded',
    ambiguityFlags: medication.provisional ? ['provisional medication seed'] : [],
    conflictMarkers: [],
    sourceAttribution: (medication.sourceLinks || []).map((url: string, index: number) => ({
      label: medication.sourceTitles?.[index] || medication.displayName,
      url,
      authority: 'trusted-external',
      kind: 'external' as const,
    })),
    retrievalDate: medicationLibrarySeed.generatedAt || '2026-04-21',
  }));
}

function buildWorkflowGuidance(): WorkflowGuidance[] {
  return [
    {
      id: 'workflow_cpt',
      label: 'Psych CPT and billing support',
      category: 'cpt',
      aliases: ['cpt', 'billing', '90833', '90791', '90792', 'therapy code', 'psychotherapy add-on'],
      guidance: ['Keep coding support separate from diagnosis certainty.', 'Use documentation support language conservatively.'],
      cautions: ['Do not upgrade a note into billable support if the source is sparse.'],
      authority: 'workflow-rules',
      useMode: 'workflow-guidance',
      evidenceConfidence: 'moderate',
      reviewStatus: 'seeded',
      ambiguityFlags: [],
      conflictMarkers: [],
      sourceAttribution: [{ label: 'Internal workflow guidance', authority: 'internal', kind: 'internal' }],
      retrievalDate: '2026-04-21',
    },
    {
      id: 'workflow_medical_necessity',
      label: 'Psych medical necessity support',
      category: 'medical-necessity',
      aliases: ['medical necessity', 'continued inpatient', 'why now', 'continued monitoring', 'inpatient psych'],
      guidance: ['Favor explicit risk, failed lower levels of care, and current reassessment details.'],
      cautions: ['Do not imply a higher level of care without source-backed why-now support.'],
      authority: 'workflow-rules',
      useMode: 'workflow-guidance',
      evidenceConfidence: 'moderate',
      reviewStatus: 'seeded',
      ambiguityFlags: [],
      conflictMarkers: [],
      sourceAttribution: [{ label: 'Internal workflow guidance', authority: 'internal', kind: 'internal' }],
      retrievalDate: '2026-04-21',
    },
    {
      id: 'workflow_documentation',
      label: 'Psych documentation structure support',
      category: 'documentation',
      aliases: ['documentation', 'soap', 'assessment', 'plan', 'mse', 'hpi', 'note structure'],
      guidance: ['Preserve uncertainty when source is incomplete.', 'Keep patient-reported, observed, and inferred material distinct.'],
      cautions: ['Do not silently harden symptoms into diagnoses.'],
      authority: 'workflow-rules',
      useMode: 'workflow-guidance',
      evidenceConfidence: 'moderate',
      reviewStatus: 'seeded',
      ambiguityFlags: [],
      conflictMarkers: [],
      sourceAttribution: [{ label: 'Internal workflow guidance', authority: 'internal', kind: 'internal' }],
      retrievalDate: '2026-04-21',
    },
  ];
}

function buildTrustedReferences(): TrustedReference[] {
  const references = [
    ...DIAGNOSIS_CONCEPTS.flatMap((item) => item.sourceAttribution),
    ...Object.values(EMERGING_DRUG_REFERENCES).map((reference) => ({
      label: reference.label,
      url: reference.url,
      authority: 'trusted-external',
      kind: 'external' as const,
    })),
  ];
  const seen = new Set<string>();
  return references
    .filter((reference) => {
      if (!reference.url || seen.has(reference.url)) {
        return false;
      }
      seen.add(reference.url);
      return true;
    })
    .map((reference) => ({
      id: `trusted:${reference.url}`,
      label: reference.label,
      url: reference.url || '',
      domain: reference.url ? new URL(reference.url).hostname : '',
      categories: ['psychiatry'],
      aliases: [reference.label],
      authority: 'trusted-external' as const,
      useMode: 'reference-only' as const,
      evidenceConfidence: 'moderate' as const,
      reviewStatus: 'seeded' as const,
      ambiguityFlags: [],
      conflictMarkers: [],
      sourceAttribution: [reference],
      retrievalDate: '2026-04-21',
    }));
}

export function buildKnowledgeRegistry(): KnowledgeRegistry {
  return {
    diagnosisConcepts: DIAGNOSIS_CONCEPTS,
    codingEntries: DIAGNOSIS_CODING_ENTRIES,
    medicationConcepts: buildMedicationConcepts(),
    emergingDrugConcepts: EMERGING_DRUG_CLASSES,
    workflowGuidance: buildWorkflowGuidance(),
    trustedReferences: buildTrustedReferences(),
    memoryItems: [],
  };
}

export function resolveKnowledgeBundle(query: KnowledgeQuery) {
  return queryKnowledgeRegistry(buildKnowledgeRegistry(), query);
}

export * from '@/lib/veranote/knowledge/types';
export * from '@/lib/veranote/knowledge/registry';
export * from '@/lib/veranote/knowledge/diagnosis/diagnosis-concepts';
export * from '@/lib/veranote/knowledge/substances/emerging-drug-concepts';
