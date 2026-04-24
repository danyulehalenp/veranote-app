import { buildEmergingDrugScenarioHelp, buildEmergingDrugTemplateHelp } from '@/lib/veranote/assistant-emerging-drug-intelligence';
import {
  LEGACY_DIAGNOSIS_CONCEPTS as DIAGNOSES,
  getLegacyDiagnosisConceptById as getDiagnosis,
  hasDiagnosisConceptCue as hasConceptCue,
  looksLikeDiagnosisCodingQuestion as looksLikeCodingQuestion,
  mergeDiagnosisConceptReferences as mergeConceptReferences,
  type LegacyDiagnosisConcept as DiagnosisConcept,
} from '@/lib/veranote/knowledge/diagnosis/diagnosis-concepts';
import type { AssistantReferenceSource, AssistantResponsePayload } from '@/types/assistant';

export {
  DIAGNOSIS_CONCEPTS,
  DIAGNOSIS_CODING_ENTRIES,
} from '@/lib/veranote/knowledge/diagnosis/diagnosis-concepts';

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
  {
    test: /\b(addiction|substance use|substance abuse|addiction medicine|sud|substance-induced)\b/,
    build: () => buildSubstanceFamilyHelp(),
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
  {
    test: /\bstimulant intoxication\b.*\b(vs|versus)\b.*\bstimulant withdrawal\b|\bstimulant withdrawal\b.*\b(vs|versus)\b.*\bstimulant intoxication\b/,
    build: () => buildStimulantIntoxicationVsWithdrawalHelp(),
  },
  {
    test: /\bintoxication\b.*\b(vs|versus)\b.*\bwithdrawal\b|\bwithdrawal\b.*\b(vs|versus)\b.*\bintoxication\b/,
    build: () => buildIntoxicationVsWithdrawalHelp(),
  },
  {
    test: /\bsubstance use disorder\b.*\b(vs|versus)\b.*\bsubstance[-\/ ]?(induced|medication-induced)\b|\bsubstance[-\/ ]?(induced|medication-induced)\b.*\b(vs|versus)\b.*\bsubstance use disorder\b/,
    build: () => buildUseDisorderVsSubstanceInducedHelp(),
  },
  {
    test: /\b(meth|methamphetamine|stimulant) psychosis\b.*\b(vs|versus)\b.*\bschizophrenia\b|\bschizophrenia\b.*\b(vs|versus)\b.*\b(meth|methamphetamine|stimulant) psychosis\b/,
    build: () => buildStimulantPsychosisVsSchizophreniaHelp(),
  },
  {
    test: /\balcohol use disorder\b.*\b(vs|versus)\b.*\balcohol[- ]?(induced|related).*\bdepress|\balcohol[- ]?(induced|related).*\bdepress.*\b(vs|versus)\b.*\balcohol use disorder\b/,
    build: () => buildAudVsAlcoholInducedDepressionHelp(),
  },
  {
    test: /\bopioid use disorder\b.*\b(vs|versus)\b.*\b(prescribed opioid|opioid prescription|pain management exposure|medical opioid exposure)\b|\b(prescribed opioid|opioid prescription|pain management exposure|medical opioid exposure)\b.*\b(vs|versus)\b.*\bopioid use disorder\b/,
    build: () => buildOudVsPrescribedExposureHelp(),
  },
  {
    test: /\bcannabis use disorder\b.*\b(vs|versus)\b.*\bcannabis psychosis\b|\bcannabis psychosis\b.*\b(vs|versus)\b.*\bcannabis use disorder\b/,
    build: () => buildCannabisUseVsCannabisPsychosisHelp(),
  },
  {
    test: /\balcohol withdrawal\b.*\b(vs|versus)\b.*\bdelirium\b|\bdelirium\b.*\b(vs|versus)\b.*\balcohol withdrawal\b/,
    build: () => buildAlcoholWithdrawalVsDeliriumHelp(),
  },
  {
    test: /\balcohol withdrawal\b.*\b(vs|versus)\b.*\b(dt|dts|delirium tremens)\b|\b(dt|dts|delirium tremens)\b.*\b(vs|versus)\b.*\balcohol withdrawal\b/,
    build: () => buildAlcoholWithdrawalVsDtsHelp(),
  },
  {
    test: /\bcannabis anxiety\b.*\b(vs|versus)\b.*\bcannabis psychosis\b|\bcannabis psychosis\b.*\b(vs|versus)\b.*\bcannabis anxiety\b/,
    build: () => buildCannabisAnxietyVsPsychosisHelp(),
  },
  {
    test: /\bopioid withdrawal\b.*\b(vs|versus)\b.*\b(primary )?(anxiety|depression|restlessness)\b|\b(primary )?(anxiety|depression|restlessness)\b.*\b(vs|versus)\b.*\bopioid withdrawal\b/,
    build: () => buildOpioidWithdrawalVsPrimaryMoodAnxietyHelp(),
  },
  {
    test: /\b(stimulant|meth|methamphetamine)[- ]?(induced )?(mania|manic symptoms)\b.*\b(vs|versus)\b.*\b(bipolar|bipolar disorder|mania)\b|\b(bipolar|bipolar disorder|mania)\b.*\b(vs|versus)\b.*\b(stimulant|meth|methamphetamine)[- ]?(induced )?(mania|manic symptoms)\b/,
    build: () => buildStimulantInducedManiaVsBipolarHelp(),
  },
];

const AGE_QUESTION_PATTERNS = [
  /\bwhat age\b/,
  /\bhow old\b/,
  /\bat what age\b/,
  /\bminimum age\b/,
  /\bage requirement\b/,
  /\bunder 18\b/,
  /\bbefore age\b/,
  /\bin children\b/,
  /\bin adolescents\b/,
  /\bin teens\b/,
  /\bcan .* be diagnosed in adults\b/,
  /\bcan .* be diagnosed as an adult\b/,
];

const DURATION_QUESTION_PATTERNS = [
  /\bhow long\b/,
  /\bhow many months\b/,
  /\bhow many weeks\b/,
  /\bduration\b/,
  /\bhow long does .* have to last\b/,
  /\bhow long do symptoms have to be present\b/,
  /\bminimum duration\b/,
];

const HISTORY_QUESTION_PATTERNS = [
  /\bhistory requirement\b/,
  /\bbefore age 15\b/,
  /\bonset requirement\b/,
  /\bwhat history\b/,
  /\brequire.*history\b/,
];

const SYMPTOM_QUESTION_PATTERNS = [
  /\bwhat are symptoms of\b/,
  /\bwhat are the symptoms of\b/,
  /\bwhat symptoms does\b/,
  /\bwhat symptoms do\b/,
  /\bwhat are signs of\b/,
  /\bwhat are the signs of\b/,
  /\bsymptoms of\b/,
  /\bsigns of\b/,
];

const RULE_OUT_QUESTION_PATTERNS = [
  /\brule out\b/,
  /\bbefore diagnosing\b/,
  /\bbefore calling this\b/,
  /\bwhat do you have to rule out\b/,
  /\bwhat should be ruled out\b/,
  /\bstops looking purely substance induced\b/,
  /\blong term psychosis\b/,
  /\bsubstance induced psychosis\b/,
  /\blast a long time\b/,
  /\bpersist\b/,
  /\bmeth psychosis\b/,
  /\bstimulant psychosis\b/,
  /\bcannabis psychosis\b/,
];

const DOCUMENTATION_QUESTION_PATTERNS = [
  /\bwhat should i document\b/,
  /\bhow should i document\b/,
  /\bhow do i document\b/,
  /\bhow should i word\b/,
  /\bwhat matters to document\b/,
  /\bwhat should be documented\b/,
  /\bdocument the timeline\b/,
  /\bsubstance timeline\b/,
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

  const ageHelp = buildAgeQuestionHelp(normalized);
  if (ageHelp) {
    return ageHelp;
  }

  const durationHelp = buildDurationQuestionHelp(normalized);
  if (durationHelp) {
    return durationHelp;
  }

  const historyHelp = buildHistoryQuestionHelp(normalized);
  if (historyHelp) {
    return historyHelp;
  }

  const symptomHelp = buildSymptomQuestionHelp(normalized);
  if (symptomHelp) {
    return symptomHelp;
  }

  const templateHelp = buildSubstanceTemplateHelp(normalized);
  if (templateHelp) {
    return templateHelp;
  }

  const documentationHelp = buildDocumentationQuestionHelp(normalized);
  if (documentationHelp) {
    return documentationHelp;
  }

  const emergingDrugConceptHelp = buildEmergingDrugConceptHelp(normalized);
  if (emergingDrugConceptHelp) {
    return emergingDrugConceptHelp;
  }

  const scenarioHelp = buildSubstanceScenarioHelp(normalized);
  if (scenarioHelp) {
    return scenarioHelp;
  }

  const ruleOutHelp = buildRuleOutQuestionHelp(normalized);
  if (ruleOutHelp) {
    return ruleOutHelp;
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

function buildAgeQuestionHelp(normalizedMessage: string): AssistantResponsePayload | null {
  if (!AGE_QUESTION_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return null;
  }

  if (/\bantisocial personality disorder\b|\baspd\b/.test(normalizedMessage)) {
    const aspd = getDiagnosis('dx_aspd');

    return {
      message: [
        'Antisocial personality disorder is an adult diagnosis and is generally not made before age 18.',
        'It also requires a history consistent with conduct-disorder-type symptoms before age 15.',
      ].join(' '),
      suggestions: [
        aspd?.timeframeSummary || null,
        'If the patient is still a child or adolescent, the clinician usually has to describe the conduct-pattern history rather than diagnosing ASPD.',
        aspd?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${aspd.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: aspd ? buildConceptReferences(aspd) : [],
    };
  }

  if (/\bconduct disorder\b|\bchildhood[- ]onset conduct disorder\b|\badolescent[- ]onset conduct disorder\b/.test(normalizedMessage)) {
    const conduct = getDiagnosis('dx_conduct_disorder');

    return {
      message: [
        'Conduct disorder is typically diagnosed in childhood or adolescence rather than first diagnosed for the first time in adulthood.',
        'The specifier split is based on whether at least one symptom began before age 10 or not until after age 10.',
      ].join(' '),
      suggestions: [
        conduct?.timeframeSummary || null,
        'If the patient is age 18 or older, the clinician usually needs to think separately about antisocial personality disorder, which requires evidence of conduct-disorder-type symptoms before age 15.',
        conduct?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${conduct.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: conduct ? buildConceptReferences(conduct) : [],
    };
  }

  if (/\bdmdd\b|\bdisruptive mood dysregulation disorder\b/.test(normalizedMessage)) {
    const dmdd = getDiagnosis('dx_dmdd');

    return {
      message: [
        'DMDD is a pediatric diagnosis, not a general adult irritability label.',
        'The diagnosis is typically made between ages 6 and 10, and the onset of symptoms has to be before age 10.',
      ].join(' '),
      suggestions: [
        dmdd?.minimumDuration || null,
        'If the patient is an adult, clinicians usually need to describe the current syndrome differently rather than newly diagnosing DMDD for the first time.',
        dmdd?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${dmdd.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: dmdd ? buildConceptReferences(dmdd) : [],
    };
  }

  if (/\badhd\b|\battention[- ]deficit\/hyperactivity disorder\b|\battention deficit hyperactivity disorder\b/.test(normalizedMessage)) {
    const adhd = getDiagnosis('dx_adhd');

    return {
      message: [
        'ADHD can be diagnosed in adults, but the symptoms must have begun in childhood rather than first appearing for the first time in adulthood.',
        'The age anchor providers usually look for is evidence that several symptoms were present before age 12.',
      ].join(' '),
      suggestions: [
        adhd?.timeframeSummary || null,
        adhd?.minimumDuration || null,
        adhd?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${adhd.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: adhd ? buildConceptReferences(adhd) : [],
    };
  }

  if (/\bborderline personality disorder\b|\bbpd\b/.test(normalizedMessage)) {
    const borderline = getDiagnosis('dx_borderline_personality');

    return {
      message: [
        'Borderline personality disorder is usually diagnosed in late adolescence or early adulthood rather than in younger children.',
        'Occasionally, someone younger than 18 can be diagnosed if the symptoms are clearly significant and have persisted for at least a year.',
      ].join(' '),
      suggestions: [
        'Providers still need to be careful not to confuse trauma reactions, mood disorders, ADHD, or normal adolescent turmoil with a fixed personality-disorder label.',
        borderline?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${borderline.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: borderline ? buildConceptReferences(borderline) : [],
    };
  }

  return null;
}

function buildSymptomQuestionHelp(normalizedMessage: string): AssistantResponsePayload | null {
  if (!SYMPTOM_QUESTION_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return null;
  }

  if (/\balcohol withdrawal\b/.test(normalizedMessage)) {
    const aud = getDiagnosis('dx_aud');
    const delirium = getDiagnosis('dx_delirium');

    return {
      message: [
        'Typical alcohol-withdrawal symptoms can include tremor, anxiety, sweating, tachycardia, insomnia, nausea or vomiting, autonomic activation, and sometimes perceptual disturbance or agitation after recent reduction or cessation of heavy alcohol use.',
        'More severe concern signs include confusion or fluctuating attention, severe agitation, hallucinations, seizures, or delirium-level changes, which should not be treated like simple anxiety alone.',
      ].join(' '),
      suggestions: [
        'High-yield provider checks are last drink, daily amount, prior withdrawal, seizure or DT history, current vital-sign abnormalities, and whether the presentation looks medically unstable.',
        aud?.timeframeSummary || null,
        delirium?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: mergeConceptReferences('dx_aud', 'dx_delirium'),
    };
  }

  if (/\bbenzodiazepine withdrawal\b|\bbenzo withdrawal\b/.test(normalizedMessage)) {
    return {
      message: [
        'Benzodiazepine-withdrawal symptoms can include anxiety, tremor, insomnia, autonomic activation, panic-like symptoms, perceptual disturbance, derealization, and in more severe cases seizures or delirium-like changes after abrupt reduction or stop.',
        'The risk picture depends a lot on dose, duration, half-life, co-use, and whether the patient stopped abruptly after regular exposure.',
      ].join(' '),
      suggestions: [
        'High-yield provider checks are last dose, daily amount, duration of use, seizure history, alcohol or sedative co-use, and whether medically supervised withdrawal management is needed.',
        'Abrupt discontinuation after chronic benzodiazepine exposure is the key caution point.',
      ],
      references: [
        {
          label: 'ASAM Benzodiazepine Tapering',
          url: 'https://www.asam.org/quality-care/clinical-guidelines/benzodiazepine-tapering',
          sourceType: 'external',
        },
      ],
    };
  }

  if (/\bopioid withdrawal\b/.test(normalizedMessage)) {
    const oud = getDiagnosis('dx_oud');

    return {
      message: [
        'Opioid-withdrawal symptoms often include anxiety or restlessness, yawning, rhinorrhea, sweating, chills, GI upset, body aches, piloerection, dilated pupils, and insomnia after recent opioid reduction or cessation.',
        'It can look emotionally distressed, but the opioid timeline and physical withdrawal signs are usually what keep it from reading like primary anxiety or depression alone.',
      ].join(' '),
      suggestions: [
        'High-yield provider checks are the specific opioid, last use, onset after dose reduction or stop, objective withdrawal findings, and overdose risk if the patient returns to use.',
        oud?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: mergeConceptReferences('dx_oud', 'dx_unspecified_anxiety', 'dx_substance_induced_depressive'),
    };
  }

  if (/\bstimulant intoxication\b/.test(normalizedMessage)) {
    const stimulant = getDiagnosis('dx_stimulant_use_disorder');

    return {
      message: [
        'Stimulant-intoxication symptoms can include agitation, insomnia, autonomic activation, paranoia, grandiosity, pressured behavior or speech, and other activated or psychotic-looking features during or shortly after use.',
        'The most useful first-pass distinctions are timing of use, degree of sleep deprivation, medical instability, and whether the patient still looks clearly stimulated versus already crashing.',
      ].join(' '),
      suggestions: [
        'High-yield provider checks are last use, route, amount, days without sleep, vital signs, chest pain, hyperthermia, and whether psychotic or manic-looking features persist after rest.',
        stimulant?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: mergeConceptReferences('dx_stimulant_use_disorder', 'dx_substance_induced_psychotic', 'dx_substance_induced_bipolar'),
    };
  }

  return null;
}

function buildDurationQuestionHelp(normalizedMessage: string): AssistantResponsePayload | null {
  if (!DURATION_QUESTION_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return null;
  }

  if (/\bmdd\b|\bmajor depressive disorder\b|\bmajor depressive episode\b|\bmajor depression\b/.test(normalizedMessage)) {
    const mdd = getDiagnosis('dx_mdd');
    const mde = getDiagnosis('dx_major_depressive_episode');

    return {
      message: [
        'For a major depressive episode or major depressive disorder, the usual episode-duration threshold is at least 2 weeks.',
        'A bad few days by itself is not enough to call it a major depressive episode.',
      ].join(' '),
      suggestions: [
        mde?.timeframeSummary || mdd?.timeframeSummary || null,
        mdd?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${mdd.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: mergeConceptReferences('dx_mdd', 'dx_major_depressive_episode'),
    };
  }

  if (/\bpersistent depressive disorder\b|\bpdd\b|\bdysthymi(a|c)\b/.test(normalizedMessage)) {
    const pdd = getDiagnosis('dx_pdd');

    return {
      message: [
        'For persistent depressive disorder, the usual chronicity threshold is at least 2 years in adults or at least 1 year in children and adolescents.',
        'It is the chronicity that separates it from a shorter major depressive episode.',
      ].join(' '),
      suggestions: [
        pdd?.timeframeSummary || null,
        pdd?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${pdd.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: pdd ? buildConceptReferences(pdd) : [],
    };
  }

  if (/\bgad\b|\bgeneralized anxiety disorder\b/.test(normalizedMessage)) {
    const gad = getDiagnosis('dx_gad');

    return {
      message: [
        'For generalized anxiety disorder, the usual duration threshold is excessive worry more days than not for at least 6 months.',
        'Brief stress reactions or one anxious week are not enough by themselves.',
      ].join(' '),
      suggestions: [
        gad?.timeframeSummary || null,
        gad?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${gad.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: gad ? buildConceptReferences(gad) : [],
    };
  }

  if (/\bpanic disorder\b/.test(normalizedMessage)) {
    const panic = getDiagnosis('dx_panic_disorder');

    return {
      message: [
        'Panic attacks themselves are brief, but panic disorder usually requires recurrent unexpected panic attacks plus at least 1 month of persistent concern or behavior change after an attack.',
        'One isolated panic attack is not the same thing as panic disorder.',
      ].join(' '),
      suggestions: [
        panic?.timeframeSummary || null,
        panic?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${panic.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: panic ? buildConceptReferences(panic) : [],
    };
  }

  if (/\bconduct disorder\b/.test(normalizedMessage)) {
    const conduct = getDiagnosis('dx_conduct_disorder');

    return {
      message: [
        'For conduct disorder, the usual formal duration anchor is a 12-month pattern with at least one symptom present in the past 6 months.',
        'It should not be diagnosed off one isolated event.',
      ].join(' '),
      suggestions: [
        conduct?.timeframeSummary || null,
        conduct?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${conduct.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: conduct ? buildConceptReferences(conduct) : [],
    };
  }

  if (/\bodd\b|\boppositional defiant disorder\b/.test(normalizedMessage)) {
    const odd = getDiagnosis('dx_odd');

    return {
      message: [
        'For oppositional defiant disorder, the usual duration anchor is a persistent pattern lasting about 6 months or more.',
        'It should not be diagnosed from one conflict-heavy visit or one bad week.',
      ].join(' '),
      suggestions: [
        odd?.timeframeSummary || null,
        odd?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${odd.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: odd ? buildConceptReferences(odd) : [],
    };
  }

  if (/\bdmdd\b|\bdisruptive mood dysregulation disorder\b/.test(normalizedMessage)) {
    const dmdd = getDiagnosis('dx_dmdd');

    return {
      message: [
        'For DMDD, the chronicity anchor is symptoms for 12 months or more across settings without a long symptom-free stretch.',
        'It is not meant for short-lived irritability or one crisis period.',
      ].join(' '),
      suggestions: [
        dmdd?.timeframeSummary || null,
        'The age frame still matters too: DMDD is a youth diagnosis, typically diagnosed between ages 6 and 10 with symptom onset before age 10.',
        dmdd?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${dmdd.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: dmdd ? buildConceptReferences(dmdd) : [],
    };
  }

  if (/\badhd\b|\battention[- ]deficit\/hyperactivity disorder\b|\battention deficit hyperactivity disorder\b/.test(normalizedMessage)) {
    const adhd = getDiagnosis('dx_adhd');

    return {
      message: [
        'ADHD does not have a short episode-style duration rule like a 2-week or 1-month syndrome.',
        'What matters more is that the symptoms are persistent, impairing, present in more than one setting, and traceable back to childhood before age 12.',
      ].join(' '),
      suggestions: [
        adhd?.timeframeSummary || null,
        adhd?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${adhd.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: adhd ? buildConceptReferences(adhd) : [],
    };
  }

  if (/\bptsd\b|\bpost-traumatic stress disorder\b/.test(normalizedMessage)) {
    const ptsd = getDiagnosis('dx_ptsd');

    return {
      message: [
        'For PTSD, the usual duration threshold is symptoms lasting more than 1 month after the trauma.',
        'If the syndrome is still in the 3-day to 1-month window after trauma, acute stress disorder is the closer fit.',
      ].join(' '),
      suggestions: [
        ptsd?.timeframeSummary || null,
        ptsd?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${ptsd.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: ptsd ? buildConceptReferences(ptsd) : [],
    };
  }

  if (/\bacute stress disorder\b|\basd\b/.test(normalizedMessage)) {
    const acuteStress = getDiagnosis('dx_acute_stress_disorder');

    return {
      message: [
        'For acute stress disorder, the usual duration window is from 3 days up to 1 month after the trauma.',
        'If the trauma-related syndrome persists beyond 1 month, clinicians usually have to think more about PTSD instead.',
      ].join(' '),
      suggestions: [
        acuteStress?.timeframeSummary || null,
        acuteStress?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${acuteStress.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: acuteStress ? buildConceptReferences(acuteStress) : [],
    };
  }

  if (/\binsomnia\b|\bchronic insomnia\b|\binsomnia disorder\b/.test(normalizedMessage)) {
    const insomnia = getDiagnosis('dx_insomnia');

    return {
      message: [
        'For chronic insomnia disorder, a common benchmark is trouble sleeping at least 3 nights per week for 3 months or longer.',
        'Short-term stress insomnia can look similar but does not automatically meet that chronic threshold.',
      ].join(' '),
      suggestions: [
        insomnia?.timeframeSummary || null,
        insomnia?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${insomnia.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: insomnia ? buildConceptReferences(insomnia) : [],
    };
  }

  if (/\bbrief psychotic disorder\b/.test(normalizedMessage)) {
    const briefPsychotic = getDiagnosis('dx_brief_psychotic_disorder');

    return {
      message: [
        'For brief psychotic disorder, the usual duration window is at least 1 day but less than 1 month, with eventual full return to premorbid baseline.',
        'If the syndrome lasts longer than that, clinicians usually have to think more about schizophreniform disorder or schizophrenia instead.',
      ].join(' '),
      suggestions: [
        briefPsychotic?.timeframeSummary || null,
        briefPsychotic?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${briefPsychotic.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: briefPsychotic ? buildConceptReferences(briefPsychotic) : [],
    };
  }

  if (/\bschizophreniform disorder\b/.test(normalizedMessage)) {
    const schizophreniform = getDiagnosis('dx_schizophreniform');

    return {
      message: [
        'For schizophreniform disorder, the usual duration window is at least 1 month but less than 6 months.',
        'That is the middle duration band between brief psychotic disorder and schizophrenia.',
      ].join(' '),
      suggestions: [
        schizophreniform?.timeframeSummary || null,
        schizophreniform?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${schizophreniform.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: schizophreniform ? buildConceptReferences(schizophreniform) : [],
    };
  }

  if (/\bschizophrenia\b/.test(normalizedMessage)) {
    const schizophrenia = getDiagnosis('dx_schizophrenia');

    return {
      message: [
        'For schizophrenia, the usual duration anchor is continuous signs of illness for at least 6 months, including at least 1 month of active-phase symptoms unless effectively treated sooner.',
        'A shorter psychotic course points clinicians toward brief psychotic disorder or schizophreniform disorder instead.',
      ].join(' '),
      suggestions: [
        schizophrenia?.timeframeSummary || null,
        schizophrenia?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${schizophrenia.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: schizophrenia ? buildConceptReferences(schizophrenia) : [],
    };
  }

  if (/\bschizoaffective\b/.test(normalizedMessage)) {
    const schizoaffective = getDiagnosis('dx_schizoaffective');

    return {
      message: [
        'Schizoaffective disorder does not have one simple short duration band like brief psychotic disorder or schizophreniform disorder.',
        'The key longitudinal requirement is at least 2 weeks of psychosis without mood symptoms, while mood episodes are present for the majority of the total illness duration.',
      ].join(' '),
      suggestions: [
        schizoaffective?.timeframeSummary || null,
        schizoaffective?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${schizoaffective.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: schizoaffective ? buildConceptReferences(schizoaffective) : [],
    };
  }

  if (/\bsubstance induced psychosis\b|\bsubstance-induced psychosis\b|\bdrug induced psychosis\b|\bmedication induced psychosis\b|\bmeth(amphetamine)? psychosis\b|\bstimulant psychosis\b|\bcannabis psychosis\b|((\bsubstance induced\b|\bsubstance-induced\b).*\bpsychotic symptoms\b)|(\bpsychotic symptoms\b.*(\bsubstance induced\b|\bsubstance-induced\b))/.test(normalizedMessage)) {
    const substancePsychosis = getDiagnosis('dx_substance_induced_psychotic');

    return {
      message: [
        'There is not one single universal day-count where substance-induced psychosis suddenly becomes a primary psychotic disorder.',
        'What matters most is the temporal sequence around intoxication, withdrawal, or medication exposure and whether psychotic symptoms persist during meaningful abstinence or observation.',
      ].join(' '),
      suggestions: [
        substancePsychosis?.timeframeSummary || null,
        'Longer-lasting psychosis after substance exposure can happen, but clinicians still need to document the timeline carefully instead of jumping straight to schizophrenia or schizoaffective disorder.',
        substancePsychosis?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${substancePsychosis.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: substancePsychosis ? buildConceptReferences(substancePsychosis) : [],
    };
  }

  if (/\badjustment disorder\b/.test(normalizedMessage)) {
    const adjustment = getDiagnosis('dx_adjustment_disorder');

    return {
      message: [
        'For adjustment disorder, the timing anchor is that symptoms begin within 3 months of the stressor.',
        'They also generally should not persist for more than 6 months after the stressor or its consequences have ended.',
      ].join(' '),
      suggestions: [
        adjustment?.timeframeSummary || null,
        adjustment?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${adjustment.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: adjustment ? buildConceptReferences(adjustment) : [],
    };
  }

  return null;
}

function buildHistoryQuestionHelp(normalizedMessage: string): AssistantResponsePayload | null {
  if (!HISTORY_QUESTION_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return null;
  }

  if (/\bantisocial personality disorder\b|\baspd\b/.test(normalizedMessage)) {
    const aspd = getDiagnosis('dx_aspd');

    return {
      message: [
        'For antisocial personality disorder, one of the key history requirements is evidence of conduct-disorder-type symptoms before age 15.',
        'ASPD also reflects an adult pattern, so it is not just “aggressive behavior” or one forensic event in adulthood.',
      ].join(' '),
      suggestions: [
        aspd?.timeframeSummary || null,
        aspd?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${aspd.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: aspd ? buildConceptReferences(aspd) : [],
    };
  }

  return null;
}

function buildRuleOutQuestionHelp(normalizedMessage: string): AssistantResponsePayload | null {
  if (!RULE_OUT_QUESTION_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return null;
  }

  if (/\bschizoaffective\b/.test(normalizedMessage) && /\bhow long\b|\bduration\b/.test(normalizedMessage)) {
    const schizoaffective = getDiagnosis('dx_schizoaffective');

    return {
      message: [
        'Schizoaffective disorder does not have one simple short duration band like brief psychotic disorder or schizophreniform disorder.',
        'The key longitudinal requirement is at least 2 weeks of psychosis without mood symptoms, while mood episodes are present for the majority of the total illness duration.',
      ].join(' '),
      suggestions: [
        schizoaffective?.timeframeSummary || null,
        schizoaffective?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${schizoaffective.likelyIcd10Family}.` : null,
      ].filter(Boolean) as string[],
      references: schizoaffective ? buildConceptReferences(schizoaffective) : [],
    };
  }

  if (/\bsubstance induced psychosis\b|\bsubstance-induced psychosis\b|\bdrug induced psychosis\b|\bmedication induced psychosis\b|\bmeth(amphetamine)? psychosis\b|\bstimulant psychosis\b|\bcannabis psychosis\b|((\bsubstance induced\b|\bsubstance-induced\b).*\bpsychotic symptoms\b)|(\bpsychotic symptoms\b.*(\bsubstance induced\b|\bsubstance-induced\b))/.test(normalizedMessage)) {
    const substancePsychosis = getDiagnosis('dx_substance_induced_psychotic');

    if (/\blong term psychosis\b|\blast a long time\b|\bpersist\b|\bstops looking purely substance induced\b|\bhow long\b/.test(normalizedMessage)) {
      return {
        message: [
          'There is not one single universal day-count where substance-induced psychosis suddenly becomes a primary psychotic disorder.',
          'What matters most is the temporal sequence around intoxication, withdrawal, or medication exposure and whether psychotic symptoms persist during meaningful abstinence or observation.',
        ].join(' '),
        suggestions: [
          substancePsychosis?.timeframeSummary || null,
          'Longer-lasting psychosis after substance exposure can happen, but clinicians still need to document the timeline carefully instead of jumping straight to schizophrenia or schizoaffective disorder.',
          substancePsychosis?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${substancePsychosis.likelyIcd10Family}.` : null,
        ].filter(Boolean) as string[],
        references: substancePsychosis ? buildConceptReferences(substancePsychosis) : [],
      };
    }
  }

  if (/\bpsychosis\b|\bpsychotic symptoms\b|\bschizophrenia\b|\bschizoaffective\b|\bprimary psychosis\b|\bprimary psychotic disorder\b/.test(normalizedMessage)) {
    const schizophrenia = getDiagnosis('dx_schizophrenia');
    const schizoaffective = getDiagnosis('dx_schizoaffective');
    const substancePsychosis = getDiagnosis('dx_substance_induced_psychotic');

    return {
      message: [
        'Before calling psychosis a primary psychotic disorder, clinicians usually need to keep substance-induced causes, medication effects, delirium or medical causes, and mood disorders with psychosis explicitly in the differential.',
        'In everyday psych practice, the substance timeline is often one of the most important things to document before upgrading someone to schizophrenia-spectrum illness.',
      ].join(' '),
      suggestions: [
        'The high-yield documentation points are the temporal sequence around intoxication, withdrawal, medication exposure, current abstinence, and whether psychosis clearly persists outside those windows.',
        schizoaffective ? 'If prominent mood episodes are part of the picture, schizoaffective disorder still requires a period of psychosis without mood symptoms rather than just mood symptoms plus psychosis together.' : null,
        substancePsychosis?.timeframeSummary || schizophrenia?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: mergeConceptReferences('dx_substance_induced_psychotic', 'dx_schizophrenia', 'dx_schizoaffective'),
    };
  }

  return null;
}

function buildSubstanceTemplateHelp(normalizedMessage: string): AssistantResponsePayload | null {
  const wantsTemplate = /\b(chart[- ]ready|note[- ]ready|chart ready|note ready|template|wording|language|phrasing|phrase|write|word)\b/.test(normalizedMessage);
  if (!wantsTemplate) {
    return null;
  }

  if (/\bsubstance rule[- ]?out\b|\brule[- ]?out language\b|\bsubstance[- ]induced contribution\b/.test(normalizedMessage)) {
    return {
      message: 'Chart-ready option: "Substance- or medication-induced contribution remains on the differential given the reported exposure history, symptom timing, and current presentation. Additional longitudinal data during abstinence or stabilization would help clarify primary versus substance-induced symptoms."',
      suggestions: [
        'Make this stronger by naming the actual substance or medication, the timing of onset, and whether symptoms persist outside expected intoxication or withdrawal windows.',
        'Use this when you want to stay source-faithful without prematurely closing the differential.',
      ],
      references: mergeConceptReferences('dx_substance_induced_psychotic', 'dx_substance_induced_depressive', 'dx_substance_induced_bipolar'),
    };
  }

  if (/\bco[- ]occurring\b|\bcooccurring\b|\bco-occurring\b.*\b(substance|sud|addiction)\b|\bsubstance\b.*\bco-occurring\b/.test(normalizedMessage)) {
    return {
      message: 'Chart-ready option: "Presentation is consistent with possible co-occurring psychiatric and substance-related conditions. Symptoms appear to fluctuate with substance exposure while additional longitudinal history is needed to clarify which symptoms predate, persist independent of, or are worsened by substance use."',
      suggestions: [
        'If you have the facts, replace the general wording with whether symptoms predated use, persist during abstinence, or mainly worsen with use.',
        'This works well when you want to avoid false certainty in either direction.',
      ],
      references: mergeConceptReferences('dx_aud', 'dx_oud', 'dx_cannabis_use_disorder', 'dx_stimulant_use_disorder', 'dx_substance_induced_psychotic', 'dx_substance_induced_depressive'),
    };
  }

  if (/\balcohol withdrawal\b|\bwithdrawal risk\b.*\balcohol\b|\balcohol\b.*\bwithdrawal risk\b/.test(normalizedMessage)) {
    const aud = getDiagnosis('dx_aud');

    return {
      message: 'Chart-ready option: "Given reported daily heavy alcohol use, recent reduction or cessation, and current symptoms such as tremor or autonomic activation, alcohol withdrawal risk should be assessed. Withdrawal-management level of care should be based on current clinical status and withdrawal history."',
      suggestions: [
        'Tighten it further by naming last drink, withdrawal-seizure or DT history, and current objective findings if you have them.',
        aud?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: mergeConceptReferences('dx_aud'),
    };
  }

  if (/\bbenzodiazepine withdrawal\b|\balprazolam\b|\bbenzo\b.*\bwithdrawal\b/.test(normalizedMessage)) {
    return {
      message: 'Chart-ready option: "Given the duration and frequency of benzodiazepine exposure and current symptoms including anxiety, insomnia, tremor, or perceptual disturbance, benzodiazepine withdrawal should be considered. Abrupt discontinuation may be unsafe when physical dependence is present."',
      suggestions: [
        'If you know the details, add dose, last use, seizure history, and sedative or alcohol co-use.',
        'Avoid minimizing this as routine panic alone when withdrawal is plausible.',
      ],
      references: [
        {
          label: 'ASAM Benzodiazepine Tapering',
          url: 'https://www.asam.org/quality-care/clinical-guidelines/benzodiazepine-tapering',
          sourceType: 'external',
        },
      ],
    };
  }

  const earlyEmergingDrugTemplateHelp = buildEmergingDrugTemplateHelp(normalizedMessage);
  if (
    earlyEmergingDrugTemplateHelp
    && /\b(xylazine|medetomidine|tranq|bath salts|flakka|alpha-pvp|tianeptine|zaza|tianaa|neptune'?s fix|delta-8|delta 8|hhc|thc-o|thcp|phenibut|bromazolam|etizolam|nitazene|m30|pressed pill|fake oxy|fake xanax)\b/.test(normalizedMessage)
  ) {
    return earlyEmergingDrugTemplateHelp;
  }

  if (/\bopioid overdose\b|\bnaloxone\b|\boverdose risk\b.*\bopioid\b|\bfentanyl\b.*\bwording\b/.test(normalizedMessage)) {
    const oud = getDiagnosis('dx_oud');

    return {
      message: 'Chart-ready option: "Opioid overdose risk is elevated given fentanyl or other opioid exposure, prior overdose history, and current naloxone gap. Consider overdose education, naloxone access, and evaluation for evidence-based treatment options for opioid use disorder."',
      suggestions: [
        'If documented, add whether the patient uses alone, has lost tolerance, or combines opioids with sedatives.',
        oud?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: [
        {
          label: 'SAMHSA TIP 63',
          url: 'https://library.samhsa.gov/product/TIP-63-Medications-for-Opioid-Use-Disorder-Full-Document/PEP21-02-01-002',
          sourceType: 'external',
        },
        {
          label: 'CDC Naloxone',
          url: 'https://www.cdc.gov/stop-overdose/caring/naloxone.html',
          sourceType: 'external',
        },
      ],
    };
  }

  if (/\bopioid withdrawal\b.*\b(wording|language|phrase|template)\b|\b(wording|language|phrase|template)\b.*\bopioid withdrawal\b/.test(normalizedMessage)) {
    const oud = getDiagnosis('dx_oud');

    return {
      message: 'Chart-ready option: "Current symptoms may reflect opioid withdrawal given the reported opioid exposure pattern, recent reduction or cessation, and associated physical withdrawal signs. The clinical picture should be interpreted in the context of timing, last use, and objective withdrawal features rather than mood or anxiety wording alone."',
      suggestions: [
        'If documented, add the specific opioid, last use, onset after dose reduction or stop, and physical findings like GI upset, chills, yawning, or piloerection.',
        oud?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: mergeConceptReferences('dx_oud', 'dx_unspecified_anxiety', 'dx_substance_induced_depressive'),
    };
  }

  if (/\bstimulant[- ]induced psychosis\b|\bstimulant\b.*\bmania\b|\bmeth\b.*\bpsychosis\b|\bmeth\b.*\bwording\b/.test(normalizedMessage)) {
    return {
      message: 'Chart-ready option: "Stimulant-induced psychosis or mania-like symptoms remain a significant consideration given reported stimulant exposure, severe sleep deprivation, and symptom onset during or after use. Primary bipolar or psychotic disorder cannot be excluded without longitudinal history and symptom course during abstinence."',
      suggestions: [
        'If you can, add last stimulant use, route, sleep duration, and whether symptoms persist after rest or abstinence.',
        'This wording works better when it names methamphetamine or cocaine explicitly instead of saying only substance-related.',
      ],
      references: mergeConceptReferences('dx_stimulant_use_disorder', 'dx_substance_induced_psychotic', 'dx_substance_induced_bipolar'),
    };
  }

  if (/\bsynthetic cannabinoid\b|\bmojo\b|\bk2\b|\bspice\b/.test(normalizedMessage)) {
    return {
      message: 'Chart-ready option: "Synthetic cannabinoid exposure should be considered given reported Mojo, K2, Spice, or similar product use together with agitation, paranoia, hallucinations, tachycardia, vomiting, or seizure-like symptoms. Routine toxicology screening may not detect synthetic cannabinoids."',
      suggestions: [
        'If applicable, add the exact product name and whether medical instability makes standard psych placement unsafe.',
        'If you are documenting a negative urine drug screen, keep it contextual rather than using it to rule out the history.',
      ],
      references: [
        {
          label: 'NIDA Synthetic Cannabinoids',
          url: 'https://nida.nih.gov/publications/drugfacts/synthetic-cannabinoids-k2spice',
          sourceType: 'external',
        },
      ],
    };
  }

  if (/\btoxicology limitation\b|\buds limitation\b|\burine drug screen limitation\b|\buds negative\b.*\bwording\b/.test(normalizedMessage)) {
    return {
      message: 'Chart-ready option: "Urine drug screen results should be interpreted in clinical context. Screening immunoassays are presumptive and may not detect all substances or synthetic compounds depending on the assay, so a negative result does not automatically exclude the reported exposure history."',
      suggestions: [
        'This is especially useful when the history suggests synthetic cannabinoids, designer products, or other exposures a routine screen may miss.',
        'If the result is consequential, the note can mention confirmatory testing when appropriate instead of overclaiming from the screen alone.',
      ],
      references: [
        {
          label: 'NIDA Synthetic Cannabinoids',
          url: 'https://nida.nih.gov/publications/drugfacts/synthetic-cannabinoids-k2spice',
          sourceType: 'external',
        },
      ],
    };
  }

  if (/\bcannabis\b.*\badhd\b|\bthc\b.*\battention\b|\bcannabis\b.*\banxiety\b|\bcannabis\b.*\bpsychosis\b/.test(normalizedMessage)) {
    const cannabis = getDiagnosis('dx_cannabis_use_disorder');

    return {
      message: 'Chart-ready option: "Cannabis or THC exposure may be contributing to anxiety, paranoia, attention impairment, or sleep disturbance. Further assessment of symptom course during reduced use or abstinence may help clarify whether the presentation is primarily substance-related, primary psychiatric, or co-occurring."',
      suggestions: [
        'If relevant, add potency, frequency, last use, and whether the symptoms worsened after increased THC exposure.',
        cannabis?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: [
        {
          label: 'NIDA Cannabis',
          url: 'https://nida.nih.gov/infofacts/marijuana.html',
          sourceType: 'external',
        },
      ],
    };
  }

  const emergingDrugTemplateHelp = buildEmergingDrugTemplateHelp(normalizedMessage);
  if (emergingDrugTemplateHelp) {
    return emergingDrugTemplateHelp;
  }

  return null;
}

function buildDocumentationQuestionHelp(normalizedMessage: string): AssistantResponsePayload | null {
  if (!DOCUMENTATION_QUESTION_PATTERNS.some((pattern) => pattern.test(normalizedMessage))) {
    return null;
  }

  if (/\bsubstance\b|\baddiction\b|\bintoxication\b|\bwithdrawal\b|\bpsychosis\b|\buse disorder\b|\balcohol\b|\bopioid\b|\bcannabis\b|\bmeth\b|\bstimulant\b/.test(normalizedMessage)) {
    const substancePsychosis = getDiagnosis('dx_substance_induced_psychotic');
    const substanceDepression = getDiagnosis('dx_substance_induced_depressive');
    const stimulant = getDiagnosis('dx_stimulant_use_disorder');
    const cannabis = getDiagnosis('dx_cannabis_use_disorder');
    const aud = getDiagnosis('dx_aud');
    const oud = getDiagnosis('dx_oud');

    return {
      message: [
        'For substance-related documentation, the most important section is usually the timeline rather than the label.',
        'A strong note names the substance, last known use, amount or pattern, intoxication versus withdrawal context, current symptoms, current abstinence window, and whether symptoms clearly persist outside the expected exposure window.',
      ].join(' '),
      suggestions: [
        'If psychosis or mood symptoms are present, document whether they began during intoxication, during withdrawal, before the substance pattern escalated, or during meaningful abstinence.',
        stimulant || cannabis ? 'For meth, stimulant, or cannabis cases, make the specific substance explicit instead of writing only “drug-induced” or “substance-related.”' : null,
        aud || oud || substancePsychosis || substanceDepression ? 'Also keep the pattern-of-use diagnosis separate from any substance-induced syndrome, because a patient can have both.' : null,
      ].filter(Boolean) as string[],
      references: mergeConceptReferences(
        'dx_substance_induced_psychotic',
        'dx_substance_induced_depressive',
        'dx_stimulant_use_disorder',
        'dx_cannabis_use_disorder',
        'dx_aud',
        'dx_oud'
      ),
    };
  }

  return null;
}

function buildEmergingDrugConceptHelp(normalizedMessage: string): AssistantResponsePayload | null {
  if (!hasConceptCue(normalizedMessage)) {
    return null;
  }

  return buildEmergingDrugScenarioHelp(normalizedMessage) || buildEmergingDrugTemplateHelp(normalizedMessage);
}

function buildSubstanceScenarioHelp(normalizedMessage: string): AssistantResponsePayload | null {
  if (
    /\b(8-10 drinks nightly|drinks nightly|wakes tremulous|last drink 18 hours ago|passive si)\b/.test(normalizedMessage) &&
    /\b(depression|insomnia|guilt|tremulous|drink)\b/.test(normalizedMessage)
  ) {
    const aud = getDiagnosis('dx_aud');
    const substanceDepression = getDiagnosis('dx_substance_induced_depressive');

    return {
      message: [
        'This presentation should keep alcohol use disorder assessment, alcohol withdrawal risk, suicide risk, and possible substance-induced depressive symptoms high on the list.',
        'It would be safer to clarify the alcohol timeline and withdrawal severity before treating this as uncomplicated primary depression or reflexively framing it as an SSRI-only problem.',
      ].join(' '),
      suggestions: [
        'High-yield provider checks are last drink, withdrawal history, seizure/DT history, current vital-sign or autonomic findings, and whether the depressive symptoms improve outside drinking/withdrawal cycles.',
        aud?.timeframeSummary || null,
        substanceDepression?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: mergeConceptReferences('dx_aud', 'dx_substance_induced_depressive'),
    };
  }

  if (
    /\b(pressured speech|paranoia|grandiosity)\b/.test(normalizedMessage) &&
    /\b(no sleep for four days|awake four days|daily meth use|meth use|methamphetamine)\b/.test(normalizedMessage)
  ) {
    const stimulant = getDiagnosis('dx_stimulant_use_disorder');
    const substancePsychosis = getDiagnosis('dx_substance_induced_psychotic');
    const substanceBipolar = getDiagnosis('dx_substance_induced_bipolar');

    return {
      message: [
        'This reads more like stimulant intoxication with substance-induced psychosis or mania-like symptoms plus severe sleep deprivation than a clean primary bipolar diagnosis on first pass.',
        'Primary bipolar disorder is not excluded, but it should not be assumed before the meth timeline, abstinence course, and sleep collapse are made explicit.',
      ].join(' '),
      suggestions: [
        'High-yield provider checks are last meth use, route/amount, days without sleep, medical instability, and whether psychotic or manic features persist after rest and abstinence.',
        stimulant?.timeframeSummary || null,
        substancePsychosis?.timeframeSummary || substanceBipolar?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: mergeConceptReferences('dx_stimulant_use_disorder', 'dx_substance_induced_psychotic', 'dx_substance_induced_bipolar'),
    };
  }

  if (
    /\balprazolam\b/.test(normalizedMessage) &&
    /\b(abruptly|abrupt stop|stopped)\b/.test(normalizedMessage) &&
    /\b(daily use for months|daily use|months)\b/.test(normalizedMessage) &&
    /\b(panic|insomnia|tremor|derealization)\b/.test(normalizedMessage)
  ) {
    return {
      message: [
        'This presentation is concerning for benzodiazepine withdrawal, with seizure-risk assessment and supervised taper logic more important than treating it like routine panic alone.',
        'Abrupt discontinuation after long daily alprazolam exposure can be unsafe.',
      ].join(' '),
      suggestions: [
        'High-yield provider checks are dose/frequency, exact stop date, seizure history, alcohol or sedative co-use, perceptual disturbance, and whether a medically supervised taper or higher level of withdrawal management is needed.',
        'Avoid abrupt discontinuation language when physical dependence is plausible.',
      ],
      references: [
        {
          label: 'ASAM Benzodiazepine Tapering',
          url: 'https://www.asam.org/quality-care/clinical-guidelines/benzodiazepine-tapering',
          sourceType: 'external',
        },
      ],
    };
  }

  if (
    /\bmojo\b|\bk2\b|\bspice\b|\bsynthetic weed\b/.test(normalizedMessage) &&
    /\b(severe agitation|hallucinations|vomiting|tachycardia)\b/.test(normalizedMessage)
  ) {
    return {
      message: [
        'This should raise concern for a severe synthetic cannabinoid reaction rather than routine cannabis intoxication.',
        'A negative routine urine drug screen does not rule that out, and the combination of agitation, hallucinations, vomiting, and tachycardia should keep urgent medical evaluation on the table.',
      ].join(' '),
      suggestions: [
        'High-yield provider checks are exact product name, co-use, seizure risk, hyperthermia or autonomic instability, and whether the patient is medically safe for standard psych placement.',
        'Synthetic cannabinoid exposure should be documented explicitly when the history points to Mojo, K2, or Spice.',
      ],
      references: [
        {
          label: 'NIDA Synthetic Cannabinoids',
          url: 'https://nida.nih.gov/publications/drugfacts/synthetic-cannabinoids-k2spice',
          sourceType: 'external',
        },
      ],
    };
  }

  const earlyEmergingDrugScenarioHelp = buildEmergingDrugScenarioHelp(normalizedMessage);
  if (
    earlyEmergingDrugScenarioHelp
    && /\b(prolonged sedation after naloxone|xylazine|medetomidine|tranq|bath salts|flakka|alpha-pvp|tianeptine|zaza|tianaa|neptune'?s fix|phenibut|bromazolam|etizolam|m30|pressed pill|fake oxy|fake xanax|nitazene)\b/.test(normalizedMessage)
  ) {
    return earlyEmergingDrugScenarioHelp;
  }

  if (
    /\bfentanyl\b/.test(normalizedMessage) &&
    /\b(prior overdose|overdose)\b/.test(normalizedMessage) &&
    /\bno naloxone\b/.test(normalizedMessage)
  ) {
    const oud = getDiagnosis('dx_oud');

    return {
      message: [
        'This scenario should keep opioid use disorder assessment, withdrawal-related dysphoria, and overdose risk front and center rather than framing it as antidepressant failure alone.',
        'Naloxone access and evidence-based OUD treatment discussion belong in the provider thinking here.',
      ].join(' '),
      suggestions: [
        'High-yield provider checks are last fentanyl use, frequency, using alone, loss of tolerance, withdrawal pattern between uses, naloxone access, and interest or readiness for MOUD.',
        oud?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: [
        {
          label: 'SAMHSA TIP 63',
          url: 'https://library.samhsa.gov/product/TIP-63-Medications-for-Opioid-Use-Disorder-Full-Document/PEP21-02-01-002',
          sourceType: 'external',
        },
        {
          label: 'CDC Naloxone',
          url: 'https://www.cdc.gov/stop-overdose/caring/naloxone.html',
          sourceType: 'external',
        },
      ],
    };
  }

  if (
    /\b7-oh\b|\b7oh\b|\bkratom\b/.test(normalizedMessage) &&
    /\b(sweats|restlessness)\b/.test(normalizedMessage) &&
    /\b(skipping|when skipping)\b/.test(normalizedMessage)
  ) {
    return {
      message: [
        'This pattern should raise concern for 7-OH or kratom-related dependence with withdrawal-type symptoms, not just generic anxiety.',
        'Because these smoke-shop products can act more like opioid-like exposure than a harmless supplement, the exact product and withdrawal timeline matter.',
      ].join(' '),
      suggestions: [
        'High-yield provider checks are exact product name, amount/frequency, co-use, last use, withdrawal pattern, and whether other opioid exposure is also in the picture.',
        'Document 7-OH explicitly if that is the reported product rather than collapsing it into vague supplement language.',
      ],
      references: [
        {
          label: 'FDA 7-OH Warning',
          url: 'https://www.fda.gov/news-events/press-announcements/fda-issues-warning-letters-firms-marketing-products-containing-7-hydroxymitragynine',
          sourceType: 'external',
        },
      ],
    };
  }

  if (
    /\badhd\b/.test(normalizedMessage) &&
    /\bstimulant\b/.test(normalizedMessage) &&
    /\b(thc vape|thc|cannabis)\b/.test(normalizedMessage) &&
    /\b(4-5 hours|4 to 5 hours|sleeps 4-5 hours)\b/.test(normalizedMessage)
  ) {
    const cannabis = getDiagnosis('dx_cannabis_use_disorder');

    return {
      message: [
        'This ADHD evaluation is meaningfully confounded by nightly high-potency THC exposure and sleep deprivation, so a premature stimulant conclusion would be risky.',
        'The cleaner question is whether attention improves during reduced cannabis exposure and sleep restoration before assuming primary ADHD alone.',
      ].join(' '),
      suggestions: [
        'High-yield provider checks are baseline childhood attention history, timing of worsening after increased THC use, actual sober/sleep-restored functioning, and whether cannabis is contributing to anxiety, sleep disruption, or attentional slowing.',
        cannabis?.timeframeSummary || null,
      ].filter(Boolean) as string[],
      references: [
        {
          label: 'NIDA Cannabis',
          url: 'https://nida.nih.gov/infofacts/marijuana.html',
          sourceType: 'external',
        },
      ],
    };
  }

  const emergingDrugScenarioHelp = buildEmergingDrugScenarioHelp(normalizedMessage);
  if (emergingDrugScenarioHelp) {
    return emergingDrugScenarioHelp;
  }

  return null;
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

function buildSubstanceFamilyHelp(): AssistantResponsePayload {
  const aud = getDiagnosis('dx_aud');
  const oud = getDiagnosis('dx_oud');
  const cannabis = getDiagnosis('dx_cannabis_use_disorder');
  const stimulant = getDiagnosis('dx_stimulant_use_disorder');
  const substancePsychosis = getDiagnosis('dx_substance_induced_psychotic');
  const substanceDepression = getDiagnosis('dx_substance_induced_depressive');

  return {
    message: [
      'When providers talk about addiction or substance-related psychopathology, the first split is usually intoxication, withdrawal, substance use disorder, or a substance-induced psychiatric syndrome rather than one catchall label.',
      aud?.summary || oud?.summary || stimulant?.summary,
    ].filter(Boolean).join(' '),
    suggestions: [
      aud ? `Alcohol use disorder is assessed over a 12-month pattern, while acute intoxication or withdrawal alone is not the same thing as AUD.` : null,
      substancePsychosis ? `Substance-induced psychiatric syndromes like psychosis or depression live or die on timeline documentation around intoxication, withdrawal, exposure, and abstinence.` : null,
      stimulant ? `For stimulant or meth-related cases, name the substance when possible and keep psychosis, mood symptoms, and use disorder distinct instead of collapsing them together.` : null,
      cannabis?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM substance-family coding anchors.` : null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences(
      'dx_aud',
      'dx_oud',
      'dx_cannabis_use_disorder',
      'dx_stimulant_use_disorder',
      'dx_substance_induced_psychotic',
      'dx_substance_induced_depressive'
    ),
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

function buildIntoxicationVsWithdrawalHelp(): AssistantResponsePayload {
  const aud = getDiagnosis('dx_aud');
  const oud = getDiagnosis('dx_oud');

  return {
    message: [
      'Intoxication and withdrawal are not opposites in name only. Intoxication refers to effects during or right after substance exposure, while withdrawal refers to symptoms that emerge as the substance wears off or is stopped.',
      'Neither one by itself automatically proves a substance use disorder, and both can temporarily mimic primary psychiatric illness.',
    ].join(' '),
    suggestions: [
      'The high-yield documentation points are last known use, pattern/amount, current symptoms, objective exam findings, and whether the syndrome fits intoxication, withdrawal, or something persisting beyond that window.',
      aud?.timeframeSummary || oud?.timeframeSummary || null,
      'If you want, I can also help compare substance use disorder versus substance-induced psychiatric disorder.',
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_aud', 'dx_oud', 'dx_substance_induced_psychotic', 'dx_substance_induced_depressive'),
  };
}

function buildUseDisorderVsSubstanceInducedHelp(): AssistantResponsePayload {
  const stimulant = getDiagnosis('dx_stimulant_use_disorder');
  const cannabis = getDiagnosis('dx_cannabis_use_disorder');
  const substancePsychosis = getDiagnosis('dx_substance_induced_psychotic');
  const substanceDepression = getDiagnosis('dx_substance_induced_depressive');

  return {
    message: [
      'A substance use disorder describes the problematic pattern of use itself over time, while a substance-induced disorder describes psychiatric symptoms judged to be caused by intoxication, withdrawal, or medication exposure.',
      'A patient can have one, the other, or both, so they should not be collapsed into the same diagnosis concept.',
    ].join(' '),
    suggestions: [
      stimulant?.timeframeSummary || cannabis?.timeframeSummary || null,
      substancePsychosis ? `Substance-induced syndromes depend more on temporal linkage and observation during abstinence than on the 12-month use-disorder frame.` : null,
      substanceDepression?.timeframeSummary || null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences(
      'dx_stimulant_use_disorder',
      'dx_cannabis_use_disorder',
      'dx_substance_induced_psychotic',
      'dx_substance_induced_depressive',
      'dx_substance_induced_bipolar'
    ),
  };
}

function buildStimulantPsychosisVsSchizophreniaHelp(): AssistantResponsePayload {
  const schizophrenia = getDiagnosis('dx_schizophrenia');
  const stimulant = getDiagnosis('dx_stimulant_use_disorder');
  const substancePsychosis = getDiagnosis('dx_substance_induced_psychotic');

  return {
    message: [
      'Methamphetamine- or stimulant-related psychosis can look a lot like schizophrenia acutely, so the timeline is critical.',
      schizophrenia ? `Schizophrenia depends on chronicity and exclusion of other causes: ${schizophrenia.timeframeSummary}` : null,
      substancePsychosis ? `Stimulant-related psychosis depends on careful linkage to use, intoxication, withdrawal, and persistence outside those windows.` : null,
    ].filter(Boolean).join(' '),
    suggestions: [
      'The note should make the stimulant exposure pattern, last use, abstinence window, and persistence of psychosis explicit instead of jumping straight to a primary schizophrenia-spectrum label.',
      stimulant?.timeframeSummary || null,
      'Longer-lasting stimulant psychosis can happen, which is exactly why longitudinal follow-up and uncertainty language matter.',
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_stimulant_use_disorder', 'dx_substance_induced_psychotic', 'dx_schizophrenia'),
  };
}

function buildAudVsAlcoholInducedDepressionHelp(): AssistantResponsePayload {
  const aud = getDiagnosis('dx_aud');
  const substanceDepression = getDiagnosis('dx_substance_induced_depressive');

  return {
    message: [
      'Alcohol use disorder describes the problematic alcohol-use pattern over time, while alcohol-induced depressive symptoms describe a mood syndrome linked temporally to intoxication, withdrawal, or related exposure.',
      'A patient can have AUD without an alcohol-induced depressive disorder, or both together, so they should not be treated as the same diagnosis.',
    ].join(' '),
    suggestions: [
      aud?.timeframeSummary || null,
      substanceDepression ? 'For suspected alcohol-induced depression, document the mood timeline relative to drinking, withdrawal, and abstinence instead of jumping straight to primary MDD.' : null,
      substanceDepression?.timeframeSummary || null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_aud', 'dx_substance_induced_depressive'),
  };
}

function buildOudVsPrescribedExposureHelp(): AssistantResponsePayload {
  const oud = getDiagnosis('dx_oud');

  return {
    message: [
      'Prescribed opioid exposure is not automatically opioid use disorder.',
      'OUD requires a problematic pattern with impaired control, craving, continued use despite harm, or related disorder criteria rather than the mere fact that opioids were prescribed for pain.',
    ].join(' '),
    suggestions: [
      oud?.timeframeSummary || null,
      'The note should make clear whether the opioid use is prescribed and adherent, escalating outside the plan, associated with craving or loss of control, or linked to overdose, withdrawal, or recurrent harm.',
      oud?.likelyIcd10Family ? `If you want, I can also help with the related ICD-10-CM coding family: ${oud.likelyIcd10Family}.` : null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_oud'),
  };
}

function buildCannabisUseVsCannabisPsychosisHelp(): AssistantResponsePayload {
  const cannabis = getDiagnosis('dx_cannabis_use_disorder');
  const substancePsychosis = getDiagnosis('dx_substance_induced_psychotic');

  return {
    message: [
      'Cannabis use disorder describes the problematic cannabis-use pattern over time, while cannabis psychosis refers to psychotic symptoms judged to be temporally related to cannabis exposure.',
      'A patient can use cannabis heavily without psychosis, and a psychotic presentation still needs careful timeline documentation before it is called cannabis-induced.',
    ].join(' '),
    suggestions: [
      cannabis?.timeframeSummary || null,
      substancePsychosis ? 'For suspected cannabis psychosis, document potency or amount when known, last use, onset of psychosis, and whether symptoms persist during abstinence or observation.' : null,
      substancePsychosis?.timeframeSummary || null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_cannabis_use_disorder', 'dx_substance_induced_psychotic'),
  };
}

function buildAlcoholWithdrawalVsDeliriumHelp(): AssistantResponsePayload {
  const aud = getDiagnosis('dx_aud');
  const delirium = getDiagnosis('dx_delirium');

  return {
    message: [
      'Alcohol withdrawal and delirium can overlap clinically, but they are not interchangeable labels.',
      'Alcohol withdrawal usually centers on a recent reduction or stop in heavy alcohol use with tremor, autonomic activation, anxiety, insomnia, or perceptual disturbance, while delirium is a fluctuating disturbance in attention and awareness with broader cognitive disorganization.',
    ].join(' '),
    suggestions: [
      'If the patient is disoriented, inattentive, fluctuating through the day, or medically unstable, the note should make the delirium concern explicit instead of charting only “withdrawal agitation.”',
      aud?.timeframeSummary || null,
      delirium?.timeframeSummary || null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_aud', 'dx_delirium'),
  };
}

function buildAlcoholWithdrawalVsDtsHelp(): AssistantResponsePayload {
  const aud = getDiagnosis('dx_aud');
  const delirium = getDiagnosis('dx_delirium');

  return {
    message: [
      'Delirium tremens is a severe alcohol-withdrawal state, not just a synonym for ordinary withdrawal symptoms.',
      'A patient can have alcohol withdrawal without DTs, but DT concern rises when withdrawal is accompanied by delirium-level inattention or fluctuating awareness, marked autonomic instability, severe agitation, or other signs of medical danger.',
    ].join(' '),
    suggestions: [
      'If DTs are on the table, the note should say why the presentation looks more severe than tremor and anxiety alone and should make the medical-risk picture explicit.',
      aud?.timeframeSummary || null,
      delirium?.timeframeSummary || null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_aud', 'dx_delirium'),
  };
}

function buildStimulantIntoxicationVsWithdrawalHelp(): AssistantResponsePayload {
  const stimulant = getDiagnosis('dx_stimulant_use_disorder');
  const substanceBipolar = getDiagnosis('dx_substance_induced_bipolar');

  return {
    message: [
      'Stimulant intoxication and stimulant withdrawal often look almost opposite on first pass.',
      'Intoxication is usually more activated with agitation, insomnia, paranoia, autonomic drive, or pressured behavior, while withdrawal more often looks like a crash with fatigue, hypersomnia, low mood, slowing, and intense craving.',
    ].join(' '),
    suggestions: [
      'The note should anchor last use, sleep pattern, vital-sign or activation clues, and whether the patient is crashing versus still clearly stimulated.',
      substanceBipolar ? 'If the presentation looks manic or highly activated, keep stimulant-induced mood symptoms in the differential instead of assuming primary bipolar disorder too early.' : null,
      stimulant?.timeframeSummary || null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_stimulant_use_disorder', 'dx_substance_induced_bipolar'),
  };
}

function buildCannabisAnxietyVsPsychosisHelp(): AssistantResponsePayload {
  const cannabis = getDiagnosis('dx_cannabis_use_disorder');
  const anxiety = getDiagnosis('dx_unspecified_anxiety');
  const substancePsychosis = getDiagnosis('dx_substance_induced_psychotic');

  return {
    message: [
      'Cannabis-related anxiety and cannabis-related psychosis are not the same bedside problem.',
      'Cannabis anxiety may look like panic, dread, tachycardia, or transient paranoia without a sustained psychotic syndrome, while cannabis psychosis implies more clearly psychotic symptoms such as hallucinations, delusions, or disorganization linked to the exposure timeline.',
    ].join(' '),
    suggestions: [
      'Document potency or amount if known, last use, whether the patient is reality-testing, and whether the paranoia is transient anxiety-like fear versus a more fixed psychotic belief structure.',
      anxiety?.timeframeSummary || null,
      substancePsychosis?.timeframeSummary || null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_cannabis_use_disorder', 'dx_unspecified_anxiety', 'dx_substance_induced_psychotic'),
  };
}

function buildOpioidWithdrawalVsPrimaryMoodAnxietyHelp(): AssistantResponsePayload {
  const oud = getDiagnosis('dx_oud');
  const anxiety = getDiagnosis('dx_unspecified_anxiety');
  const substanceDepression = getDiagnosis('dx_substance_induced_depressive');

  return {
    message: [
      'Opioid withdrawal can look anxious, dysphoric, or restless, but the key question is whether the syndrome tracks recent opioid reduction or cessation rather than reading like a standalone primary mood or anxiety disorder.',
      'Withdrawal usually carries a clearer opioid timeline plus physical clues like GI upset, body aches, chills, yawning, rhinorrhea, or piloerection that do not fit simple primary anxiety alone.',
    ].join(' '),
    suggestions: [
      'The note should name the opioid if known, last use, onset of symptoms after reduction or stop, and the physical withdrawal signs instead of charting only “anxious and depressed.”',
      oud?.timeframeSummary || null,
      anxiety?.timeframeSummary || substanceDepression?.timeframeSummary || null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_oud', 'dx_unspecified_anxiety', 'dx_substance_induced_depressive'),
  };
}

function buildStimulantInducedManiaVsBipolarHelp(): AssistantResponsePayload {
  const stimulant = getDiagnosis('dx_stimulant_use_disorder');
  const substanceBipolar = getDiagnosis('dx_substance_induced_bipolar');

  return {
    message: [
      'Stimulant-induced mania-like symptoms and primary bipolar disorder can look similar, but the timeline and course are what keep them apart.',
      'If activation, insomnia, grandiosity, irritability, or paranoia cluster tightly around stimulant exposure and improve with abstinence or sleep restoration, substance-induced mood symptoms stay high on the differential instead of immediately calling it primary bipolar disorder.',
    ].join(' '),
    suggestions: [
      'High-yield provider checks are last stimulant use, degree of sleep deprivation, prior independent manic episodes, family history, and whether symptoms persist when the stimulant picture clears.',
      stimulant?.timeframeSummary || substanceBipolar?.timeframeSummary || null,
    ].filter(Boolean) as string[],
    references: mergeConceptReferences('dx_stimulant_use_disorder', 'dx_substance_induced_bipolar', 'dx_bipolar1', 'dx_bipolar2'),
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

function findAmbiguousFamilyLead(normalizedMessage: string) {
  for (const [term, lead] of Object.entries(AMBIGUOUS_FAMILY_OVERRIDES)) {
    if (new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(normalizedMessage)) {
      return lead;
    }
  }

  return null;
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
