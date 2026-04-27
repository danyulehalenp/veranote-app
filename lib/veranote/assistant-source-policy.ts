import type { AssistantReferenceSource } from '@/types/assistant';
import { getEmergingDrugReferenceLinks } from '@/lib/veranote/assistant-emerging-drug-intelligence';
import { filterMemoryForPrompt } from '@/lib/veranote/memory/memory-policy';
import type { ProviderMemoryItem as AssistantProviderMemoryItem } from '@/lib/veranote/memory/memory-types';
import type { BaseKnowledgeItem, KnowledgeBundle } from '@/lib/veranote/knowledge/types';

export type AssistantReferencePolicyCategory =
  | 'coding-reference'
  | 'documentation-structure'
  | 'lab-reference'
  | 'psych-reference'
  | 'psych-med-reference'
  | 'emerging-drug-reference';

type AssistantReferencePolicyRule = {
  category: AssistantReferencePolicyCategory;
  matches: RegExp[];
  directReferences?: AssistantReferenceSource[];
  searchReferences?: AssistantReferenceSource[];
  allowedDomains: string[];
};

export type AssistantReferencePolicy = {
  categories: AssistantReferencePolicyCategory[];
  directReferences: AssistantReferenceSource[];
  searchReferences: AssistantReferenceSource[];
  allowedDomains: string[];
};

export type AssistantReferencePolicyPreview = {
  title: string;
  detail: string;
  categoryLabels: string[];
  domainLabels: string[];
};

export function isProviderMemory(item: BaseKnowledgeItem) {
  return item.useMode === 'provider-memory' || item.authority === 'provider-memory';
}

export function isReferenceOnly(item: BaseKnowledgeItem) {
  return item.useMode === 'reference-only' || item.authority === 'trusted-external';
}

export function requiresCitation(item: BaseKnowledgeItem) {
  return isReferenceOnly(item) || item.sourceAttribution.some((source) => source.kind === 'external');
}

export function canUseInPrompt(item: BaseKnowledgeItem) {
  if (isProviderMemory(item) || isReferenceOnly(item)) {
    return false;
  }

  if (item.reviewStatus === 'internal-only') {
    return false;
  }

  return item.evidenceConfidence !== 'low';
}

export function filterKnowledgeByPolicy(bundle: KnowledgeBundle): KnowledgeBundle {
  return {
    ...bundle,
    diagnosisConcepts: bundle.diagnosisConcepts.filter(canUseInPrompt),
    codingEntries: bundle.codingEntries.filter(canUseInPrompt),
    medicationConcepts: bundle.medicationConcepts.filter(canUseInPrompt),
    emergingDrugConcepts: bundle.emergingDrugConcepts.filter(canUseInPrompt),
    workflowGuidance: bundle.workflowGuidance.filter(canUseInPrompt),
    trustedReferences: bundle.trustedReferences.filter((item) => isReferenceOnly(item) && item.evidenceConfidence !== 'low'),
    memoryItems: [],
  };
}

export function filterProviderMemoryByPolicy(memoryItems: AssistantProviderMemoryItem[]) {
  return filterMemoryForPrompt(memoryItems);
}

const POLICY_RULES: AssistantReferencePolicyRule[] = [
  {
    category: 'coding-reference',
    matches: [/(icd|icd-10|icd10|diagnosis code|cpt|modifier|coding|billing|mdd|major depressive disorder|depression|persistent depressive disorder|dysthymia|dysthymic disorder|prolonged grief disorder|disruptive mood dysregulation disorder|cyclothymic disorder|anxiety|gad|generalized anxiety disorder|panic disorder|agoraphobia|specific phobia|claustrophobia|phobic anxiety disorder|bipolar|current episode mixed|current episode depressed|most recent episode depressed|most recent episode manic|most recent episode hypomanic|most recent episode mixed|ptsd|post-traumatic stress disorder|acute stress disorder|reactive attachment disorder|disinhibited social engagement disorder|adhd|attention-deficit|autism|autism spectrum disorder|asd|speech disorder|language disorder|learning disorder|expressive language disorder|mixed receptive-expressive language disorder|social pragmatic communication disorder|specific reading disorder|mathematics disorder|written expression|intellectual disability|global developmental delay|tic disorder|tourette|odd|oppositional defiant disorder|conduct disorder|selective mutism|delirium|dementia|major neurocognitive disorder|mild neurocognitive disorder|neurocognitive disorder|amnestic disorder|vascular dementia|insomnia|hypersomnia|nightmare disorder|sleep terror|sleepwalking|ocd|obsessive-compulsive disorder|body dysmorphic disorder|adjustment disorder|schizophrenia|schizoaffective|psychosis|delusional disorder|schizophreniform|dissociative disorder|dissociative identity disorder|dissociative amnesia|depersonalization|derealization|somatic symptom disorder|illness anxiety disorder|conversion disorder|functional neurological symptom disorder|factitious disorder|enuresis|encopresis|elimination disorder|gender dysphoria|gender identity disorder|transsexualism|dual role transvestism|sexual dysfunction|hypoactive sexual desire|erectile disorder|female sexual arousal disorder|female orgasmic disorder|male orgasmic disorder|premature ejaculation|sexual aversion|dyspareunia|paraphilia|fetishism|transvestic fetishism|exhibitionism|voyeurism|pedophilia|sexual masochism|sexual sadism|frotteurism|pathological gambling|gambling disorder|kleptomania|pyromania|trichotillomania|impulse disorder|personality disorder|borderline personality|antisocial personality|narcissistic personality|avoidant personality|dependent personality|eating disorder|anorexia|bulimia|binge eating disorder|arfid|alcohol use disorder|alcohol dependence|alcohol abuse|opioid use disorder|opioid dependence|opioid abuse|cannabis use disorder|cannabis dependence|cannabis abuse|stimulant use disorder|stimulant dependence|stimulant abuse|methamphetamine use disorder|amphetamine use disorder|cocaine use disorder|cocaine dependence|cocaine abuse|benzodiazepine use disorder|sedative use disorder|sedative dependence|substance use disorder|withdrawal delirium|in remission|withdrawal)/i],
    directReferences: [
      { label: 'CDC ICD-10-CM browser and overview', url: 'https://www.cdc.gov/nchs/icd/icd-10-cm/' },
      { label: 'CDC ICD-10-CM files', url: 'https://www.cdc.gov/nchs/icd/icd-10-cm/files.html' },
    ],
    searchReferences: [
      { label: 'CDC ICD-10-CM site search', url: 'https://search.cdc.gov/search/' },
      { label: 'CMS site search', url: 'https://www.cms.gov/search/cms' },
    ],
    allowedDomains: ['cdc.gov', 'cms.gov'],
  },
  {
    category: 'documentation-structure',
    matches: [/(assessment|plan|soap|h&p|consult|hpi|mse|documentation|note structure)/i],
    directReferences: [
      { label: 'CMS Evaluation and Management visits overview', url: 'https://www.cms.gov/medicare/payment/fee-schedules/physician/evaluation-management-visits' },
    ],
    searchReferences: [
      { label: 'CMS documentation search', url: 'https://www.cms.gov/search/cms' },
    ],
    allowedDomains: ['cms.gov'],
  },
  {
    category: 'lab-reference',
    matches: [/(a1c|hba1c|hemoglobin a1c|cbc|complete blood count|cmp|comprehensive metabolic panel)/i],
    directReferences: [
      { label: 'MedlinePlus Hemoglobin A1C test', url: 'https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/' },
      { label: 'MedlinePlus Complete Blood Count', url: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/' },
      { label: 'MedlinePlus Comprehensive Metabolic Panel', url: 'https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/' },
    ],
    allowedDomains: ['medlineplus.gov'],
  },
  {
    category: 'psych-reference',
    matches: [/(phq-9|phq 9|c-ssrs|cssrs|depression screening|suicide screening|major depression|depression symptoms)/i],
    directReferences: [
      { label: 'NIMH mental health topics', url: 'https://www.nimh.nih.gov/health/topics' },
      { label: 'NIMH major depression overview', url: 'https://www.nimh.nih.gov/health/statistics/major-depression' },
    ],
    allowedDomains: ['nimh.nih.gov'],
  },
  {
    category: 'emerging-drug-reference',
    matches: [/(tianeptine|neptune'?s fix|zaza|tianaa|pegasus|td red|xylazine|tranq|medetomidine|nitazene|m30|pressed pill|fake oxy|fake xanax|delta-8|delta 8|hhc|thc-o|thcp|bath salts|flakka|alpha-pvp|phenibut|bromazolam|etizolam|synthetic cannabinoid|k2|spice|mojo|7-oh|7oh|kratom extract|kratom shot)/i],
    allowedDomains: ['cdc.gov', 'dea.gov', 'deadiversion.usdoj.gov', 'fda.gov', 'unodc.org'],
  },
  {
    category: 'psych-med-reference',
    matches: [/(sertraline|zoloft|escitalopram|lexapro|bupropion|wellbutrin|zyban|venlafaxine|effexor|desvenlafaxine|pristiq|duloxetine|cymbalta|doxepin|trazodone|oxcarbazepine|trileptal|lithium|lamotrigine|lamictal|valproic acid|divalproex|depakote|quetiapine|seroquel|olanzapine|zyprexa|aripiprazole|abilify|risperidone|risperdal|clozapine|clozaril|lorazepam|ativan|psych medication|psych med|medication profile|side effects|boxed warning|black box warning|starting dose|dose of)/i],
    allowedDomains: ['medlineplus.gov'],
  },
];

export function getAssistantReferencePolicy(query: string): AssistantReferencePolicy {
  const normalized = query.trim().toLowerCase();
  const matchedRules = POLICY_RULES.filter((rule) => rule.matches.some((pattern) => pattern.test(normalized)));
  const emergingDrugReferences = getEmergingDrugReferenceLinks(normalized);

  return {
    categories: matchedRules.map((rule) => rule.category),
    directReferences: dedupeReferences(filterReferencesByQuery(normalized, [
      ...matchedRules.flatMap((rule) => rule.directReferences || []),
      ...emergingDrugReferences,
    ])),
    searchReferences: dedupeReferences(buildSearchReferences(normalized, matchedRules.flatMap((rule) => rule.searchReferences || []))),
    allowedDomains: [...new Set(matchedRules.flatMap((rule) => rule.allowedDomains))],
  };
}

export function describeAssistantReferencePolicy(query?: string): AssistantReferencePolicyPreview {
  if (!query?.trim()) {
    return {
      title: 'Trusted lookup only',
      detail: 'Atlas only uses approved external sources in this mode. Ask a coding, documentation, lab, or psych-reference question to see the active lookup policy.',
      categoryLabels: ['Coding / reference', 'Documentation structure', 'Lab reference', 'Psych reference', 'Psych medication reference', 'Emerging drug reference'],
      domainLabels: ['CDC', 'CMS', 'MedlinePlus', 'NIMH', 'DEA', 'FDA', 'UNODC'],
    };
  }

  const policy = getAssistantReferencePolicy(query);
  const categoryLabels = policy.categories.map((category) => categoryLabelMap[category]);
  const domainLabels = policy.allowedDomains.map((domain) => domainLabelMap[domain] || domain);

  if (!policy.categories.length) {
    return {
      title: 'No trusted source policy matched yet',
      detail: 'This lookup does not match one of Atlas’s approved reference categories yet, so it should stay conservative and use Teach Atlas this if the answer is missing.',
      categoryLabels: [],
      domainLabels: [],
    };
  }

  return {
    title: categoryLabels.length === 1 ? categoryLabels[0] : 'Mixed trusted lookup',
    detail: `For this lookup, Atlas is limited to ${domainLabels.join(', ')} so the external answer stays inside approved source boundaries.`,
    categoryLabels,
    domainLabels,
  };
}

const categoryLabelMap: Record<AssistantReferencePolicyCategory, string> = {
  'coding-reference': 'Coding / reference',
  'documentation-structure': 'Documentation structure',
  'lab-reference': 'Lab reference',
  'psych-reference': 'Psych reference',
  'psych-med-reference': 'Psych medication reference',
  'emerging-drug-reference': 'Emerging drug reference',
};

const domainLabelMap: Record<string, string> = {
  'cdc.gov': 'CDC',
  'cms.gov': 'CMS',
  'dea.gov': 'DEA',
  'deadiversion.usdoj.gov': 'DEA Diversion',
  'fda.gov': 'FDA',
  'medlineplus.gov': 'MedlinePlus',
  'nimh.nih.gov': 'NIMH',
  'unodc.org': 'UNODC',
};

function buildSearchReferences(query: string, references: AssistantReferenceSource[]) {
  const encoded = encodeURIComponent(query);
  return references.map((reference) => {
    if (reference.url.includes('cdc.gov/search')) {
      return {
        ...reference,
        url: `${reference.url}?query=${encoded}&affiliate=cdc-main`,
      };
    }

    if (reference.url.includes('cms.gov/search/cms')) {
      return {
        ...reference,
        url: `${reference.url}?keys=${encoded}`,
      };
    }

    return reference;
  });
}

function filterReferencesByQuery(query: string, references: AssistantReferenceSource[]) {
  return references.filter((reference) => {
    if (reference.url.includes('hemoglobin-a1c') && !/(a1c|hba1c|hemoglobin a1c)/i.test(query)) {
      return false;
    }

    if (reference.url.includes('complete-blood-count') && !/(cbc|complete blood count)/i.test(query)) {
      return false;
    }

    if (reference.url.includes('comprehensive-metabolic-panel') && !/(cmp|comprehensive metabolic panel)/i.test(query)) {
      return false;
    }

    if (reference.url.includes('major-depression') && !/(mdd|major depressive disorder|major depression|depression)/i.test(query)) {
      return false;
    }

    if (reference.url.includes('tianeptine') && !/(tianeptine|neptune'?s fix|zaza|tianaa|pegasus|td red)/i.test(query)) {
      return false;
    }

    if (reference.url.includes('xylazine') && !/(xylazine|tranq)/i.test(query)) {
      return false;
    }

    if (reference.url.includes('medetomidine') && !/(medetomidine|dexmedetomidine|prolonged sedation after naloxone)/i.test(query)) {
      return false;
    }

    if (reference.url.includes('delta-8') && !/(delta-8|delta 8|hhc|thc-o|thcp)/i.test(query)) {
      return false;
    }

    if (reference.url.includes('bath-salts') && !/(bath salts|flakka|alpha-pvp|synthetic cathinone)/i.test(query)) {
      return false;
    }

    if (reference.url.includes('benzimidazole-opioids') && !/(nitazene|m30|pressed pill|fake oxy|fake xanax|isotonitazene|metonitazene|protonitazene)/i.test(query)) {
      return false;
    }

    return true;
  });
}

function dedupeReferences(references: AssistantReferenceSource[]) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    if (!reference.url || seen.has(reference.url)) {
      return false;
    }

    seen.add(reference.url);
    return true;
  });
}
