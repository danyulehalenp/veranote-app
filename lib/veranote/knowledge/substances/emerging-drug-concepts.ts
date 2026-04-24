import type { AssistantReferenceSource, AssistantResponsePayload } from '@/types/assistant';
import { SUBSTANCE_ALIAS_LIBRARY } from '@/lib/veranote/knowledge/substances/substance-aliases';
import type { EmergingDrugConcept } from '@/lib/veranote/knowledge/types';

export type NpsClass = EmergingDrugConcept & {
  referenceIds: string[];
  chartReadyTemplate: string;
  chartSuggestion: string;
  scenarioTemplate: string;
  scenarioSuggestion: string;
};

export const EMERGING_DRUG_REFERENCES: Record<string, AssistantReferenceSource> = {
  cdc_medetomidine_han_2026: { label: 'CDC Medetomidine HAN', url: 'https://www.cdc.gov/han/php/notices/han00527.html', sourceType: 'external' },
  cdc_medetomidine_summary_2026: { label: 'CDC Medetomidine Summary', url: 'https://www.cdc.gov/overdose-prevention/situation-summary/medetomidine.html', sourceType: 'external' },
  cdc_tianeptine_neptunes_fix_2024: { label: "CDC Neptune's Fix Cluster", url: 'https://www.cdc.gov/mmwr/volumes/73/wr/mm7304a5.htm', sourceType: 'external' },
  cdc_xylazine_2024: { label: 'CDC Xylazine', url: 'https://www.cdc.gov/overdose-prevention/about/what-you-should-know-about-xylazine.html', sourceType: 'external' },
  dea_bath_salts_fact_sheet: { label: 'DEA Bath Salts Fact Sheet', url: 'https://www.dea.gov/factsheets/bath-salts', sourceType: 'external' },
  dea_k2_spice_fact_sheet: { label: 'DEA K2/Spice Fact Sheet', url: 'https://www.dea.gov/factsheets/spice-k2-synthetic-marijuana', sourceType: 'external' },
  dea_ndta_2025: { label: 'DEA 2025 NDTA', url: 'https://www.dea.gov/press-releases/2025/05/15/dea-releases-2025-national-drug-threat-assessment', sourceType: 'external' },
  dea_nitazenes_2026: { label: 'DEA Nitazenes', url: 'https://www.deadiversion.usdoj.gov/drug_chem_info/benzimidazole-opioids.pdf', sourceType: 'external' },
  fda_7oh_2025: { label: 'FDA 7-OH Warning', url: 'https://www.fda.gov/news-events/press-announcements/fda-takes-steps-restrict-7-oh-opioid-products-threatening-american-consumers', sourceType: 'external' },
  fda_delta8_2022: { label: 'FDA Delta-8 THC', url: 'https://www.fda.gov/consumers/consumer-updates/5-things-know-about-delta-8-tetrahydrocannabinol-delta-8-thc', sourceType: 'external' },
  fda_tianeptine_2025: { label: 'FDA Tianeptine Warning', url: 'https://www.fda.gov/consumers/consumer-updates/tianeptine-products-linked-serious-harm-overdoses-death', sourceType: 'external' },
  fda_tianeptine_hcp_letter_2025: { label: 'FDA Tianeptine Product Trend', url: 'https://www.fda.gov/consumers/health-fraud-scams/new-gas-station-heroin-tianeptine-product-trend', sourceType: 'external' },
  unodc_nitazenes_2025: { label: 'UNODC Nitazenes Early Warning', url: 'https://www.unodc.org/LSS/Announcement/Details/b47cf39e-f557-4001-98a8-536af5673e9e', sourceType: 'external' },
};

function conceptBase(
  id: string,
  displayName: string,
  aliases: readonly string[],
  psychSignals: readonly string[],
  medicalRedFlags: readonly string[],
  testingLimitations: readonly string[],
  documentationCautions: readonly string[],
  referenceIds: readonly string[],
) {
  return {
    id,
    displayName,
    streetNames: [...aliases],
    aliases: [...aliases],
    intoxicationSignals: [...psychSignals],
    withdrawalSignals: psychSignals.filter((signal) => /(withdrawal|restlessness|dysphoria|anxiety|insomnia)/i.test(signal)),
    testingLimitations: [...testingLimitations],
    documentationCautions: [...documentationCautions],
    psychSignals: [...psychSignals],
    medicalRedFlags: [...medicalRedFlags],
    authority: 'structured-database' as const,
    useMode: 'suggestive-only' as const,
    evidenceConfidence: 'moderate' as const,
    reviewStatus: 'provisional' as const,
    ambiguityFlags: ['substance-identity uncertainty', 'product contamination risk'],
    conflictMarkers: ['symptoms may overlap with primary psychiatric disorders'],
    sourceAttribution: [...referenceIds].map((referenceId) => ({
      label: EMERGING_DRUG_REFERENCES[referenceId]?.label || displayName,
      url: EMERGING_DRUG_REFERENCES[referenceId]?.url,
      authority: 'trusted-external',
      kind: 'external' as const,
    })),
    retrievalDate: '2026-04-21',
    referenceIds: [...referenceIds],
  };
}

export const EMERGING_DRUG_CLASSES: NpsClass[] = [
  {
    ...conceptBase(
      'hemp_derived_cannabinoids',
      'hemp-derived or semi-synthetic cannabinoid products',
      [...SUBSTANCE_ALIAS_LIBRARY.syntheticCannabinoids, 'delta-8', 'delta 8', 'delta-10', 'hhc', 'thc-o', 'thcp', 'legal thc', 'hemp gummies', 'gas station weed', 'hemp vape'],
      ['anxiety', 'panic', 'confusion', 'hallucinations', 'depersonalization', 'psychosis in vulnerable patients'],
      ['loss of consciousness', 'severe vomiting', 'pediatric ingestion', 'tremor'],
      ['Routine testing does not establish the exact product, dose, contaminants, or synthetic conversion byproducts.'],
      ['Preserve the exact gummy, vape, or smoke-shop product instead of collapsing it into ordinary cannabis alone.'],
      ['fda_delta8_2022'],
    ),
    chartReadyTemplate: 'Chart-ready option: "Hemp-derived or semi-synthetic cannabinoid exposure should be considered given reported delta-8, HHC, THC-O, THCP, or similar product use together with the current psychiatric presentation. These products can worsen anxiety, confusion, dissociation, or psychosis-like symptoms, and routine testing does not establish exact product identity or contaminants."',
    chartSuggestion: 'If possible, name the exact gummy, vape, or smoke-shop product rather than documenting this as ordinary cannabis alone.',
    scenarioTemplate: 'This presentation should keep hemp-derived or semi-synthetic cannabinoid exposure on the differential rather than assuming ordinary delta-9 cannabis alone. Product identity, contaminants, and conversion byproducts are often unclear, so psychiatric destabilization can look disproportionate to the history.',
    scenarioSuggestion: 'High-yield checks are exact product name, edible versus vape route, timing, amount, co-use, and whether symptoms escalated after a new gas-station or hemp product.',
  },
  {
    ...conceptBase(
      'synthetic_cathinones',
      'synthetic cathinones or bath-salt type stimulants',
      SUBSTANCE_ALIAS_LIBRARY.syntheticCathinones,
      ['severe anxiety', 'panic', 'mania-like activation', 'paranoia', 'hallucinations', 'agitation', 'aggression', 'insomnia'],
      ['hypertension', 'tachycardia', 'chest pain', 'hyperthermia', 'seizure', 'rhabdomyolysis'],
      ['Routine urine drug screening may miss these agents and expanded or confirmatory testing may be required.'],
      ['Avoid documenting these severe presentations as routine anxiety alone when stimulant toxidrome is plausible.'],
      ['dea_bath_salts_fact_sheet'],
    ),
    chartReadyTemplate: 'Chart-ready option: "Synthetic cathinone or bath-salt exposure should be considered given reported flakka, alpha-PVP, mephedrone, or similar stimulant-type product use together with severe agitation, paranoia, insomnia, or psychosis-like symptoms. Routine urine drug screening may miss these agents."',
    chartSuggestion: 'If the clinical picture is intense, document chest pain, hyperthermia, seizure concern, or other medical red flags rather than treating it as routine anxiety alone.',
    scenarioTemplate: 'This looks more concerning for a synthetic cathinone or bath-salt type stimulant toxidrome than a simple anxiety or primary psychosis presentation. Severe agitation, paranoia, insomnia, autonomic activation, and hyperthermia or seizure risk should keep urgent medical evaluation in play.',
    scenarioSuggestion: 'High-yield checks are exact product name, route, time of last use, sleep collapse, chest pain, temperature, and whether routine screening failed to explain the severity.',
  },
  {
    ...conceptBase(
      'fentanyl_and_synthetic_opioids',
      'fentanyl, nitazene, or counterfeit opioid products',
      SUBSTANCE_ALIAS_LIBRARY.fentanylCounterfeit,
      ['sedation', 'withdrawal dysphoria', 'anxiety', 'insomnia', 'suicidality during withdrawal'],
      ['respiratory depression', 'overdose', 'cyanosis', 'nonresponsiveness', 'polysubstance sedation'],
      ['Standard opiate screens may miss fentanyl and nitazenes, and even fentanyl-positive testing does not rule out nitazenes.'],
      ['Name the exact pill description such as M30, fake oxy, or pressed bar when it is known.'],
      ['dea_ndta_2025', 'dea_nitazenes_2026', 'unodc_nitazenes_2025'],
    ),
    chartReadyTemplate: 'Chart-ready option: "Counterfeit-pill, fentanyl, or nitazene exposure should be considered given the reported product history and current opioid-type risk. Standard opiate screens may miss fentanyl or nitazenes, so toxicology results should be interpreted cautiously and overdose-prevention planning should remain visible."',
    chartSuggestion: 'If documented, name the exact pill description such as M30, fake oxy, or pressed bar rather than assuming a legitimate pharmaceutical source.',
    scenarioTemplate: 'Unknown pressed pills or powders with opioid signs should be treated as fentanyl or nitazene risk until proven otherwise, not as a benign medication mix-up. Negative or incomplete tox data does not settle that question.',
    scenarioSuggestion: 'High-yield checks are naloxone response, respiratory status, pill appearance, source, co-use, and whether the patient has overdose history or no naloxone access.',
  },
  {
    ...conceptBase(
      'opioid_adulterants_alpha2_sedatives',
      'xylazine or medetomidine-type adulterants',
      SUBSTANCE_ALIAS_LIBRARY.adulterants,
      ['delirium', 'fluctuating alertness', 'anxiety during withdrawal', 'severe agitation during withdrawal'],
      ['prolonged sedation after naloxone', 'bradycardia', 'hypotension', 'severe hypertension during withdrawal', 'wounds'],
      ['These agents require specialized testing and are not detected on standard opioid screens.'],
      ['Document prolonged sedation after naloxone, wound burden, or extreme autonomic withdrawal rather than describing routine opioid withdrawal alone.'],
      ['cdc_xylazine_2024', 'cdc_medetomidine_han_2026', 'cdc_medetomidine_summary_2026'],
    ),
    chartReadyTemplate: 'Chart-ready option: "Xylazine, medetomidine, or another non-opioid sedative adulterant should be considered when opioid exposure is followed by prolonged sedation after naloxone or an atypical withdrawal picture. Standard opioid screening does not detect these adulterants."',
    chartSuggestion: 'If present, document prolonged sedation after naloxone, wound burden, bradycardia, hypotension, or severe autonomic symptoms during withdrawal.',
    scenarioTemplate: 'Prolonged sedation after naloxone or a severe autonomic withdrawal picture should raise concern for xylazine or medetomidine-type adulterants, not just uncomplicated fentanyl withdrawal. This pattern can require toxicology or poison-control input and higher-acuity medical evaluation.',
    scenarioSuggestion: 'High-yield checks are naloxone response, blood pressure and heart rate pattern, wound findings, fluctuating alertness, and whether opioid withdrawal treatment alone is failing.',
  },
  {
    ...conceptBase(
      'tianeptine',
      'tianeptine or gas-station heroin products',
      SUBSTANCE_ALIAS_LIBRARY.tianeptine,
      ['agitation', 'confusion', 'withdrawal anxiety', 'depression-like worsening', 'opioid-like dysphoria'],
      ['respiratory depression', 'seizure', 'tachycardia', 'hypertension', 'qt prolongation', 'qrs prolongation'],
      ['Tianeptine is not detected on routine UDS, and some products have been adulterated with synthetic cannabinoids or other drugs.'],
      ['Keep the exact brand explicit when the source says Zaza, Tianaa, Neptune’s Fix, Pegasus, or TD Red.'],
      ['fda_tianeptine_2025', 'fda_tianeptine_hcp_letter_2025', 'cdc_tianeptine_neptunes_fix_2024'],
    ),
    chartReadyTemplate: 'Chart-ready option: "Tianeptine exposure should be considered given reported Zaza, Tianaa, Neptune’s Fix, Pegasus, TD Red, or similar gas-station product use. Tianeptine can produce opioid-like intoxication or withdrawal patterns, is not detected on routine urine drug screening, and some products may be adulterated."',
    chartSuggestion: 'If you have it, document the exact brand, where it was obtained, withdrawal pattern, and any seizure, cardiac, or ICU-level symptoms.',
    scenarioTemplate: 'This presentation should raise concern for tianeptine or a gas-station heroin product rather than a simple supplement history. Opioid-like withdrawal, confusion, seizures, or cardiac-conduction concerns deserve a slower differential and higher medical caution.',
    scenarioSuggestion: 'High-yield checks are exact brand, amount/frequency, timing of last use, opioid-like withdrawal features, and whether the product could have been adulterated.',
  },
  {
    ...conceptBase(
      'kratom_7oh',
      '7-OH or kratom concentrate products',
      SUBSTANCE_ALIAS_LIBRARY.kratom,
      ['withdrawal anxiety', 'restlessness', 'dysphoria'],
      ['sedation', 'opioid-like dependence', 'polysubstance risk'],
      ['These products are not part of routine UDS unless a specialized assay is ordered.'],
      ['Document 7-OH explicitly if that is the reported product instead of vague supplement wording.'],
      ['fda_7oh_2025'],
    ),
    chartReadyTemplate: 'Chart-ready option: "Concentrated 7-OH or kratom-product exposure should be considered given the reported use history and withdrawal-like symptoms. These products may behave more like opioid-type exposure than a benign supplement, and routine urine drug screening does not test for them."',
    chartSuggestion: 'Document 7-OH explicitly if that is the reported product instead of collapsing it into vague supplement language.',
    scenarioTemplate: 'This pattern fits 7-OH or kratom-concentrate dependence with withdrawal-type symptoms more than ordinary anxiety alone, especially when the patient describes smoke-shop or gas-station opioid-like products.',
    scenarioSuggestion: 'High-yield checks are exact product, amount/frequency, last use, co-use, and whether the patient is also using other opioids.',
  },
  {
    ...conceptBase(
      'phenibut_nootropic_sedatives',
      'phenibut or nootropic sedative products',
      SUBSTANCE_ALIAS_LIBRARY.phenibut,
      ['rebound anxiety', 'agitation', 'insomnia', 'confusion'],
      ['withdrawal', 'sedation', 'seizure risk', 'delirium'],
      ['Phenibut is not detected on routine UDS.'],
      ['Supplement branding should not be treated as proof of safety.'],
      ['dea_ndta_2025'],
    ),
    chartReadyTemplate: 'Chart-ready option: "Phenibut or another nootropic sedative product should be considered when supplement-type use is followed by rebound anxiety, agitation, insomnia, or confusion. Routine urine drug screening does not identify phenibut."',
    chartSuggestion: 'If applicable, document whether the product was marketed as a sleep, anxiety, or GABA supplement and whether symptoms worsened after abrupt stopping.',
    scenarioTemplate: 'This presentation could reflect phenibut or another nootropic sedative exposure with intoxication or withdrawal features rather than a clean primary anxiety relapse. Supplement labeling should not be treated as proof of safety.',
    scenarioSuggestion: 'High-yield checks are exact product name, dose escalation, abrupt stop, co-use with alcohol or benzodiazepines, and delirium or seizure concern.',
  },
  {
    ...conceptBase(
      'designer_benzodiazepines',
      'designer benzodiazepines or counterfeit benzodiazepine products',
      SUBSTANCE_ALIAS_LIBRARY.designerBenzo,
      ['sedation', 'blackout risk', 'withdrawal anxiety', 'insomnia', 'confusion'],
      ['respiratory depression', 'withdrawal seizure risk', 'polysedative overdose'],
      ['Standard benzodiazepine screens can miss some agents or fail to identify the actual compound.'],
      ['Do not assume pressed bars or fake Xanax behave like verified prescription alprazolam.'],
      ['dea_ndta_2025'],
    ),
    chartReadyTemplate: 'Chart-ready option: "Designer benzodiazepine or counterfeit benzodiazepine exposure should be considered given reported bromazolam, etizolam, fake Xanax, or pressed-bar use. Standard benzodiazepine screening may not identify the exact agent, and withdrawal or polysedative overdose risk can be underestimated."',
    chartSuggestion: 'If possible, name the exact product and whether the source was a street pill, pressed bar, or unlabeled tablet rather than assuming prescription alprazolam.',
    scenarioTemplate: 'This may be a designer-benzodiazepine or counterfeit-benzodiazepine presentation rather than routine prescribed benzo exposure. Source uncertainty, assay limitations, and withdrawal-seizure or overdose risk should stay visible.',
    scenarioSuggestion: 'High-yield checks are exact pill description, source, co-use, last use, overdose history, and whether symptoms began after abrupt stop.',
  },
];

function normalizeTerm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAlias(message: string, aliases: string[]) {
  const normalizedMessage = normalizeTerm(message);
  return aliases.some((alias) => {
    const normalizedAlias = normalizeTerm(alias);
    if (!normalizedAlias) {
      return false;
    }
    return new RegExp(`\\b${escapeRegExp(normalizedAlias)}\\b`, 'i').test(normalizedMessage);
  });
}

function getReferences(referenceIds: string[]) {
  return referenceIds.map((referenceId) => EMERGING_DRUG_REFERENCES[referenceId]).filter(Boolean).slice(0, 3);
}

export function findMatchingEmergingDrugClass(message: string) {
  if (/\bprolonged sedation after naloxone\b|\bnaloxone\b.*\b(bradycardia|hypotension|fluctuating alertness|wounds?)\b|\b(bradycardia|hypotension|fluctuating alertness)\b.*\bnaloxone\b/.test(message)) {
    return EMERGING_DRUG_CLASSES.find((entry) => entry.id === 'opioid_adulterants_alpha2_sedatives');
  }
  if (/\bm30\b|\bpressed pill\b|\bfake oxy\b|\bfake xanax\b|\bnitazene\b/.test(message)) {
    return EMERGING_DRUG_CLASSES.find((entry) => entry.id === 'fentanyl_and_synthetic_opioids');
  }
  return EMERGING_DRUG_CLASSES.find((entry) => matchesAlias(message, entry.aliases));
}

export function buildEmergingDrugTemplateHelp(normalizedMessage: string): AssistantResponsePayload | null {
  const match = findMatchingEmergingDrugClass(normalizedMessage);
  if (!match) {
    return null;
  }
  return {
    message: match.chartReadyTemplate,
    suggestions: [
      match.chartSuggestion,
      `Testing limitation: ${match.testingLimitations[0] || 'Routine tox may not answer this cleanly.'}`,
      `Common psychiatric signals to keep visible here include ${match.psychSignals.slice(0, 3).join(', ')}.`,
    ],
    references: getReferences(match.referenceIds),
  };
}

export function buildEmergingDrugScenarioHelp(normalizedMessage: string): AssistantResponsePayload | null {
  const match = findMatchingEmergingDrugClass(normalizedMessage);
  if (!match) {
    return null;
  }
  const hasClinicalIntensity = /\b(agitation|psychosis|hallucinations|delirium|confusion|seizure|tachycardia|hypertension|hypotension|bradycardia|vomiting|naloxone|overdose|sedation|withdrawal|pressed pill|fake oxy|fake xanax|gas station|negative uds|routine uds)\b/.test(normalizedMessage);
  if (!hasClinicalIntensity) {
    return null;
  }
  return {
    message: [match.scenarioTemplate, `Testing limitation: ${match.testingLimitations[0]}`].join(' '),
    suggestions: [
      match.scenarioSuggestion,
      `Medical red flags that matter here include ${match.medicalRedFlags.slice(0, 3).join(', ')}.`,
    ],
    references: getReferences(match.referenceIds),
  };
}

export function getEmergingDrugReferenceLinks(query: string): AssistantReferenceSource[] {
  const match = findMatchingEmergingDrugClass(query);
  return match ? getReferences(match.referenceIds) : [];
}

export function buildEmergingDrugPromptGuidance(sourceInput: string): string[] {
  const match = findMatchingEmergingDrugClass(sourceInput.toLowerCase());
  if (!match) {
    return [];
  }
  const guidance = [
    `Emerging drug / NPS guardrail: ${match.displayName} may be clinically relevant in this source. Slow the diagnostic move down and keep intoxication, withdrawal, adulterant exposure, polysubstance exposure, or substance-induced psychiatric symptoms visible in the differential.`,
    `Emerging drug testing caveat: ${match.testingLimitations[0]}`,
    'If the source gives a product, street name, pressed-pill description, smoke-shop label, or gas-station brand, preserve that exact product wording instead of collapsing it into a generic substance label.',
  ];
  if (match.id === 'fentanyl_and_synthetic_opioids') {
    guidance.push('If the source describes a pressed pill, fake oxy, fake Xanax, M30, or unexplained opioid-type overdose, do not treat a negative routine opiate screen as exclusion of fentanyl or nitazene exposure.');
  }
  if (match.id === 'opioid_adulterants_alpha2_sedatives') {
    guidance.push('If sedation persists after naloxone or withdrawal looks autonomically extreme, keep xylazine or medetomidine-type adulterants explicit rather than describing this as routine opioid withdrawal alone.');
  }
  if (match.id === 'tianeptine') {
    guidance.push('If the source names Neptune’s Fix, Zaza, Tianaa, Pegasus, TD Red, or another gas-station product, keep tianeptine exposure explicit and do not reframe it as a harmless supplement.');
  }
  return guidance;
}
