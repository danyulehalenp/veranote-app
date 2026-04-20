import diagnosisSeed from '@/data/psych-psychiatry-diagnosis.seed.json';
import type { AssistantReferenceSource, AssistantResponsePayload } from '@/types/assistant';

type SeedDiagnosis = {
  id: string;
  diagnosis_name: string;
  category?: string;
  aliases?: string[];
  shorthand?: string[];
  patient_language_equivalent?: string[];
  summary?: string;
  timeframe_summary?: string;
  common_confusion_with_other_diagnoses?: string[];
  common_specifiers_modifiers?: string[];
  likely_icd10_family?: string;
  source_links?: string[];
};

type DiagnosisConcept = {
  id: string;
  diagnosisName: string;
  category?: string;
  summary?: string;
  timeframeSummary?: string;
  commonConfusionWithOtherDiagnoses?: string[];
  commonSpecifiersModifiers?: string[];
  likelyIcd10Family?: string;
  sourceLinks: string[];
  matchTerms: string[];
};

const DIAGNOSES = ((diagnosisSeed as { diagnoses?: SeedDiagnosis[] }).diagnoses || []).map((diagnosis) => ({
  id: diagnosis.id,
  diagnosisName: diagnosis.diagnosis_name,
  category: diagnosis.category,
  summary: diagnosis.summary,
  timeframeSummary: diagnosis.timeframe_summary,
  commonConfusionWithOtherDiagnoses: diagnosis.common_confusion_with_other_diagnoses || [],
  commonSpecifiersModifiers: diagnosis.common_specifiers_modifiers || [],
  likelyIcd10Family: diagnosis.likely_icd10_family,
  sourceLinks: diagnosis.source_links || [],
  matchTerms: dedupeTerms([
    diagnosis.diagnosis_name,
    ...(diagnosis.aliases || []),
    ...(diagnosis.shorthand || []),
    ...(diagnosis.patient_language_equivalent || []),
  ]),
})) as DiagnosisConcept[];

const DIAGNOSIS_BY_ID = new Map(DIAGNOSES.map((diagnosis) => [diagnosis.id, diagnosis]));

const CONCEPT_INTRO_PATTERNS = [
  /\bwhat do you know about\b/,
  /\bwhat can you tell me about\b/,
  /\btell me about\b/,
  /\bhelp me understand\b/,
  /\bexplain\b/,
  /\bwhat is\b/,
];

const AMBIGUOUS_FAMILY_OVERRIDES: Record<string, string> = {
  depression: 'When providers say depression broadly, they may mean depressive symptoms, a current major depressive episode, major depressive disorder, persistent depressive disorder, or unspecified depressive disorder depending on the actual chart language.',
  anxiety: 'When providers say anxiety broadly, they may mean generalized anxiety disorder, panic disorder, phobic anxiety, obsessive-compulsive spectrum symptoms, trauma-related anxiety, or unspecified anxiety depending on the documented syndrome.',
  psychosis: 'Psychosis is a syndrome description, not one single diagnosis. Providers still need to sort out timing, mood linkage, substance or medication effects, delirium, and primary psychotic disorders before choosing a final diagnosis.',
};

const FAMILY_CONCEPTS: Array<{
  test: RegExp;
  build: () => AssistantResponsePayload;
}> = [
  {
    test: /\bdepression\b/,
    build: () => buildDepressionFamilyHelp(),
  },
  {
    test: /\banxiety\b/,
    build: () => buildAnxietyFamilyHelp(),
  },
  {
    test: /\bpsychosis\b/,
    build: () => buildPsychosisFamilyHelp(),
  },
];

const COMPARISON_CONCEPTS: Array<{
  test: RegExp;
  build: () => AssistantResponsePayload;
}> = [
  {
    test: /\b(depression|mdd|major depressive disorder).*\b(vs|versus)\b.*\b(persistent depressive disorder|pdd|dysthymia)\b|\b(persistent depressive disorder|pdd|dysthymia).*\b(vs|versus)\b.*\b(depression|mdd|major depressive disorder)\b/,
    build: () => buildMddVsPddHelp(),
  },
  {
    test: /\bbipolar i\b.*\b(vs|versus)\b.*\bbipolar ii\b|\bbipolar ii\b.*\b(vs|versus)\b.*\bbipolar i\b/,
    build: () => buildBipolarOneVsTwoHelp(),
  },
  {
    test: /\bschizophrenia\b.*\b(vs|versus)\b.*\bschizoaffective\b|\bschizoaffective\b.*\b(vs|versus)\b.*\bschizophrenia\b/,
    build: () => buildSchizophreniaVsSchizoaffectiveHelp(),
  },
  {
    test: /\bpsychosis\b.*\b(vs|versus)\b.*\b(substance induced|substance-induced|drug induced|medication induced)\b|\b(substance induced|substance-induced|drug induced|medication induced).*\b(vs|versus)\b.*\bpsychosis\b/,
    build: () => buildPsychosisVsSubstanceInducedHelp(),
  },
];

export function buildPsychDiagnosisConceptHelp(normalizedMessage: string): AssistantResponsePayload | null {
  const normalized = normalizedMessage.toLowerCase().trim();

  if (!normalized || looksLikeCodingQuestion(normalized)) {
    return null;
  }

  const comparisonHelp = buildComparisonConceptHelp(normalized);
  if (comparisonHelp) {
    return comparisonHelp;
  }

  const familyHelp = buildFamilyConceptMatch(normalized);
  if (familyHelp) {
    return familyHelp;
  }

  const conceptMatch = findConceptDiagnosis(normalized);
  if (!conceptMatch) {
    return null;
  }

  const ambiguousLead = findAmbiguousFamilyLead(normalized);
  const summary = conceptMatch.summary || `${conceptMatch.diagnosisName} is a psychiatry diagnosis Vera can help explain at a high level.`;
  const timeframe = conceptMatch.timeframeSummary;
  const differential = conceptMatch.commonConfusionWithOtherDiagnoses?.length
    ? `Common diagnostic confusion points include ${conceptMatch.commonConfusionWithOtherDiagnoses.slice(0, 4).join(', ')}.`
    : null;
  const modifiers = conceptMatch.commonSpecifiersModifiers?.length
    ? `Common documentation modifiers include ${conceptMatch.commonSpecifiersModifiers.slice(0, 4).join(', ')}.`
    : null;

  return {
    message: [ambiguousLead, summary, timeframe].filter(Boolean).join(' '),
    suggestions: [
      differential,
      modifiers,
      conceptMatch.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${conceptMatch.likelyIcd10Family}.` : null,
    ].filter(Boolean) as string[],
    references: buildConceptReferences(conceptMatch),
  };
}

function buildComparisonConceptHelp(normalizedMessage: string) {
  return COMPARISON_CONCEPTS.find((entry) => entry.test.test(normalizedMessage))?.build() || null;
}

function buildFamilyConceptMatch(normalizedMessage: string) {
  if (!hasConceptCue(normalizedMessage)) {
    return null;
  }

  return FAMILY_CONCEPTS.find((entry) => entry.test.test(normalizedMessage))?.build() || null;
}

function buildDepressionFamilyHelp(): AssistantResponsePayload {
  const mdd = getDiagnosis('dx_mdd');
  const pdd = getDiagnosis('dx_pdd');
  const unspecified = getDiagnosis('dx_unspecified_depression');

  return {
    message: [
      'When providers say depression broadly, that can refer to depressive symptoms, a current major depressive episode, major depressive disorder, persistent depressive disorder, or unspecified depressive disorder depending on the chart context.',
      mdd?.summary,
      mdd?.timeframeSummary,
    ].filter(Boolean).join(' '),
    suggestions: [
      pdd ? `Persistent depressive disorder is the more chronic depressive pattern: ${pdd.timeframeSummary}` : null,
      unspecified ? `Unspecified depressive disorder is often the safer placeholder when the episode threshold or bipolar exclusion is still incomplete.` : null,
      mdd?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${mdd.likelyIcd10Family}.` : null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_mdd', 'dx_pdd', 'dx_unspecified_depression'),
  };
}

function buildAnxietyFamilyHelp(): AssistantResponsePayload {
  const gad = getDiagnosis('dx_gad');
  const panic = getDiagnosis('dx_panic_disorder');
  const unspecified = getDiagnosis('dx_unspecified_anxiety');
  const social = getDiagnosis('dx_social_anxiety');
  const phobia = getDiagnosis('dx_specific_phobia');

  return {
    message: [
      'When providers say anxiety broadly, the important next step is to separate chronic diffuse worry from panic, phobic avoidance, trauma-related anxiety, obsessive-compulsive symptoms, or a still-unspecified anxiety presentation.',
      gad?.summary,
      gad?.timeframeSummary,
    ].filter(Boolean).join(' '),
    suggestions: [
      panic ? `Panic disorder is more attack-driven: ${panic.timeframeSummary}` : null,
      social ? `Social anxiety disorder centers on scrutiny and embarrassment fears, while specific phobia is tied to a more circumscribed feared object or situation.` : null,
      unspecified ? `Unspecified anxiety disorder is often appropriate when the note clearly supports clinically significant anxiety but the exact syndrome still is not pinned down.` : null,
      phobia?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM anxiety-family coding anchors.` : null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_gad', 'dx_panic_disorder', 'dx_social_anxiety', 'dx_specific_phobia', 'dx_unspecified_anxiety'),
  };
}

function buildPsychosisFamilyHelp(): AssistantResponsePayload {
  const schizophrenia = getDiagnosis('dx_schizophrenia');
  const schizoaffective = getDiagnosis('dx_schizoaffective');
  const substance = getDiagnosis('dx_substance_induced_psychotic');

  return {
    message: [
      'Psychosis is a syndrome description, not one single diagnosis. The high-yield distinction is whether the psychotic symptoms look primary, mood-linked, substance- or medication-induced, delirium-related, or time-limited.',
      schizophrenia?.summary,
      schizophrenia?.timeframeSummary,
    ].filter(Boolean).join(' '),
    suggestions: [
      schizoaffective ? `Schizoaffective disorder requires a period of psychosis without mood symptoms, not just mood symptoms plus psychosis at the same time.` : null,
      substance ? `Substance- or medication-induced psychosis is a high-stakes differential where the temporal sequence around intoxication, withdrawal, or medication exposure has to stay explicit.` : null,
      schizophrenia?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM psychosis-family coding anchors.` : null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_schizophrenia', 'dx_schizoaffective', 'dx_substance_induced_psychotic'),
  };
}

function buildMddVsPddHelp(): AssistantResponsePayload {
  const mdd = getDiagnosis('dx_mdd');
  const pdd = getDiagnosis('dx_pdd');

  return {
    message: [
      'Major depressive disorder and persistent depressive disorder are both depressive diagnoses, but they are not interchangeable.',
      mdd ? `MDD is more episode-based: ${mdd.summary}` : null,
      pdd ? `Persistent depressive disorder is more chronic: ${pdd.summary}` : null,
    ].filter(Boolean).join(' '),
    suggestions: [
      mdd?.timeframeSummary || null,
      pdd?.timeframeSummary || null,
      'If you want, I can also help with the ICD-10-CM coding families for each.',
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_mdd', 'dx_pdd'),
  };
}

function buildBipolarOneVsTwoHelp(): AssistantResponsePayload {
  const bipolarOne = getDiagnosis('dx_bipolar1');
  const bipolarTwo = getDiagnosis('dx_bipolar2');

  return {
    message: [
      'The core difference between bipolar I and bipolar II is mania versus hypomania.',
      bipolarOne ? `Bipolar I requires at least one manic episode: ${bipolarOne.summary}` : null,
      bipolarTwo ? `Bipolar II requires hypomania plus at least one major depressive episode, without any full manic episode: ${bipolarTwo.summary}` : null,
    ].filter(Boolean).join(' '),
    suggestions: [
      bipolarOne?.timeframeSummary || null,
      bipolarTwo?.timeframeSummary || null,
      'If you want, I can also help with the ICD-10-CM bipolar-family coding anchors.',
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_bipolar1', 'dx_bipolar2'),
  };
}

function buildSchizophreniaVsSchizoaffectiveHelp(): AssistantResponsePayload {
  const schizophrenia = getDiagnosis('dx_schizophrenia');
  const schizoaffective = getDiagnosis('dx_schizoaffective');

  return {
    message: [
      'The main distinction is whether there is a sustained period of psychosis without mood symptoms.',
      schizophrenia ? `Schizophrenia is the more primary chronic psychotic disorder path: ${schizophrenia.summary}` : null,
      schizoaffective ? `Schizoaffective disorder requires both mood episodes and a period of psychosis without mood symptoms: ${schizoaffective.summary}` : null,
    ].filter(Boolean).join(' '),
    suggestions: [
      schizophrenia?.timeframeSummary || null,
      schizoaffective?.timeframeSummary || null,
      'If you want, I can also help with the psychosis-family coding anchors.',
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_schizophrenia', 'dx_schizoaffective'),
  };
}

function buildPsychosisVsSubstanceInducedHelp(): AssistantResponsePayload {
  const schizophrenia = getDiagnosis('dx_schizophrenia');
  const substance = getDiagnosis('dx_substance_induced_psychotic');

  return {
    message: [
      'Primary psychosis and substance-induced psychosis can look similar at the bedside, so timing is everything.',
      schizophrenia ? `Primary psychotic disorders like schizophrenia depend on chronicity and exclusion of other causes: ${schizophrenia.timeframeSummary}` : null,
      substance ? `Substance-induced psychosis requires careful linkage to intoxication, withdrawal, or medication exposure: ${substance.summary}` : null,
    ].filter(Boolean).join(' '),
    suggestions: [
      substance?.timeframeSummary || null,
      'If you want, I can help frame the diagnostic uncertainty conservatively in note language or show the ICD-10-CM families.',
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_schizophrenia', 'dx_substance_induced_psychotic'),
  };
}

function findConceptDiagnosis(normalizedMessage: string) {
  const matches = DIAGNOSES
    .map((diagnosis) => ({
      diagnosis,
      score: scoreDiagnosisMatch(diagnosis, normalizedMessage),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return matches[0]?.diagnosis || null;
}

function scoreDiagnosisMatch(diagnosis: DiagnosisConcept, normalizedMessage: string) {
  let score = 0;

  for (const term of diagnosis.matchTerms) {
    if (!term) {
      continue;
    }

    const normalizedTerm = normalizeTerm(term);
    if (!normalizedTerm) {
      continue;
    }

    if (normalizedMessage === normalizedTerm) {
      score = Math.max(score, 100);
      continue;
    }

    if (new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, 'i').test(normalizedMessage)) {
      score = Math.max(score, normalizedTerm.split(' ').length * 10 + normalizedTerm.length);
    }
  }

  if (score > 0 && hasConceptCue(normalizedMessage)) {
    score += 15;
  }

  if (score > 0 && diagnosis.id === 'dx_mdd' && /\bdepression\b/.test(normalizedMessage)) {
    score += 25;
  }

  if (score > 0 && diagnosis.id === 'dx_unspecified_anxiety' && /\banxiety\b/.test(normalizedMessage)) {
    score += 15;
  }

  return score;
}

function buildConceptReferences(diagnosis: DiagnosisConcept): AssistantReferenceSource[] {
  return diagnosis.sourceLinks
    .slice(0, 3)
    .map((url) => ({
      label: labelForConceptUrl(url),
      url,
      sourceType: 'external' as const,
    }));
}

function mergeConceptReferences(...diagnosisIds: string[]) {
  const seen = new Set<string>();
  return diagnosisIds
    .map((id) => getDiagnosis(id))
    .flatMap((diagnosis) => diagnosis?.sourceLinks || [])
    .filter((url) => {
      if (!url || seen.has(url)) {
        return false;
      }
      seen.add(url);
      return true;
    })
    .slice(0, 4)
    .map((url) => ({
      label: labelForConceptUrl(url),
      url,
      sourceType: 'external' as const,
    }));
}

function getDiagnosis(id: string) {
  return DIAGNOSIS_BY_ID.get(id);
}

function labelForConceptUrl(url: string) {
  if (url.includes('nimh.nih.gov')) {
    return 'NIMH diagnosis overview';
  }

  if (url.includes('ncbi.nlm.nih.gov')) {
    return 'NCBI Bookshelf reference';
  }

  if (url.includes('psychiatry.org')) {
    return 'APA patient and family overview';
  }

  return 'Psych reference';
}

function hasConceptCue(normalizedMessage: string) {
  return CONCEPT_INTRO_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
}

function looksLikeCodingQuestion(normalizedMessage: string) {
  return /\b(icd|icd-10|icd10|diagnosis code|coding|code|dx)\b/i.test(normalizedMessage);
}

function findAmbiguousFamilyLead(normalizedMessage: string) {
  for (const [term, lead] of Object.entries(AMBIGUOUS_FAMILY_OVERRIDES)) {
    if (new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(normalizedMessage)) {
      return lead;
    }
  }

  return null;
}

function dedupeTerms(terms: string[]) {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const normalized = normalizeTerm(term);
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function normalizeTerm(term: string) {
  return term
    .toLowerCase()
    .replace(/[()[\],/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
