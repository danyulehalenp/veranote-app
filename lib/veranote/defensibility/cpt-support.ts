import type {
  CptRecommendationCandidate,
  CptSupportAssessment,
  PostNoteCptRecommendationAssessment,
} from '@/lib/veranote/defensibility/defensibility-types';
import type { EncounterSupport } from '@/types/session';

type PostNoteCptRecommendationInput = {
  completedNoteText: string;
  noteType?: string;
  encounterSupport?: EncounterSupport;
};

function hasMatch(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function compact(value: string | undefined) {
  return value?.trim() || '';
}

function normalize(value: string | undefined) {
  return compact(value).toLowerCase();
}

function hasPsychotherapyContent(text: string) {
  const concretePsychotherapyContent = hasMatch(text, [
    /\b(cbt|dbt|motivational interviewing|cognitive restructuring|behavioral activation|exposure work|graded exposure|skills training|therapeutic intervention)\b/,
    /\b(processed|reframed|coping skills|grounding|homework|avoidance thoughts|grief triggers|behavioral experiment)\b/,
  ]);

  if (
    !concretePsychotherapyContent
    && /\b(no|not|without)\b.{0,50}\b(distinct|separate|specific)?\s*(psychotherapy|therapy|therapeutic intervention)\b/i.test(text)
  ) {
    return false;
  }

  return hasMatch(text, [
    /\b(psychotherapy|psycotherapy|psychotherpy|psychotherpay|therapy|therpay|supportive therapy|cbt|dbt|motivational interviewing|processed|reframed|coping skills)\b/,
    /\b(cognitive restructuring|behavioral activation|exposure work|skills training|therapeutic intervention)\b/,
  ]);
}

function hasMedicationManagement(text: string) {
  return hasMatch(text, [
    /\b(medication|medications|meds|med mgmt|med management|refill|increase|decrease|continue|side effect|adherence|prescrib|dose adjustment)\b/,
    /\b(started|stopped|titrated|continued)\s+\w+/,
  ]);
}

function hasMdmSupport(text: string) {
  return hasMatch(text, [
    /\b(dose adjustment|medication change|changed medication|titration|titrated|increase|decrease|start|stop|restart|hold|side effects?|adverse effects?|tolerability)\b/,
    /\b(labs?|ekg|ecg|a1c|lipids|cbc|cmp|renal|hepatic|thyroid|monitoring|reviewed|ordered|result)\b.{0,80}\b(reviewed|ordered|pending|abnormal|elevated|low|high)\b/,
    /\b(worsen(?:ed|ing)?|exacerbation|unstable|acute risk|suicid|homicid|psychosis|mania|withdrawal|toxicity|substance use)\b/,
    /\b(risk|benefit|benefits|alternatives?|medical decision|decision-making|decision making|complexity)\b/,
  ]);
}

function hasCrisisWork(text: string) {
  return hasMatch(text, [
    /\b(crisis|suicid|homicid|imminent risk|de-?escalation|safety plan|unable to maintain safety|danger to self|danger to others)\b/,
  ]);
}

function hasCommunicationComplexity(text: string) {
  return hasMatch(text, [
    /\b(interpreter|translator|guardian conflict|caregiver conflict|third party|reportable|sentinel event|communication barrier|maladaptive communication|disruptive communication)\b/,
  ]);
}

function stripExplicitMissingCptSignals(text: string) {
  return text
    .replace(/\bno\b[^.]{0,180}\b(?:encounter time|total time|time|mdm|medical decision[-\s]making|psychotherapy|therapy|psychotherapy intervention|medication[-\s]management|prescribing|risk complexity|medical decision[-\s]making details?)\b[^.]{0,100}\b(?:visible|documented|available|present|listed|noted|details?|work|support)\b/gi, ' ')
    .replace(/\bwithout\b[^.]{0,140}\b(?:time|mdm|medical decision[-\s]making|psychotherapy|therapy|medication[-\s]management|prescribing|risk complexity)\b[^.]{0,80}\b(?:visible|documented|available|present|listed|noted|details?|work|support)\b/gi, ' ')
    .replace(/\b(?:time|mdm|medical decision[-\s]making|psychotherapy|therapy|medication[-\s]management|prescribing|risk complexity)\b[^.]{0,80}\b(?:is|are)\s+not\s+(?:visible|documented|available|present|listed|noted)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasContinuityRecallContext(text: string) {
  return /\bPatient Continuity Context - Veranote recall layer\b|\bContinuity safety rule\b|\bprior context only\b|\bpreviously documented\b|\bVeranote recall layer\b/i.test(text);
}

function hasCurrentEncounterCodingSupport(text: string) {
  return hasMatch(text, [
    /\b(?:today(?:'s)?|current|this)\s+(?:encounter|visit|session|appointment)\b/,
    /\binterval update\b|\blive visit\b|\bprovider live note\b|\bduring (?:the|today(?:'s)?) visit\b/,
    /\bpatient (?:reports|endorses|denies|states|describes)\b/,
    /\b(?:medication adherence|side effects?|dose adjustment|treatment options?|risks?, benefits?,? and alternatives?) (?:reviewed|discussed|addressed)\b/,
    /\b(?:total|encounter|session|visit|psychotherapy|therapy)\s*(?:time|minutes|min)?[:\s-]*\d{1,3}\s*(?:min|mins|minute|minutes)\b/i,
    /\b(?:mental status|MSE|exam|risk assessment|safety plan|psychotherapy intervention|CBT|DBT|motivational interviewing)\b/i,
  ]);
}

function hasEvaluationWork(text: string, noteType: string) {
  return /evaluation|intake|initial/i.test(noteType)
    || hasMatch(text, [
      /\b(chief complaint|history of present illness|hpi|past psychiatric history|family psychiatric history|diagnostic impression|initial evaluation)\b/,
    ]);
}

function extractMinuteSignals(text: string, encounterSupport?: EncounterSupport) {
  const signals = new Set<string>();
  const minuteMatches = text.matchAll(/\b(?:total|encounter|session|visit|psychotherapy|therapy|crisis)?\s*(?:time|minutes|min)?[:\s-]*(\d{1,3})\s*(?:min|mins|minute|minutes)\b/gi);

  for (const match of minuteMatches) {
    signals.add(`${match[1]} minutes documented in note text.`);
  }

  const totalMinutes = compact(encounterSupport?.totalMinutes);
  const psychotherapyMinutes = compact(encounterSupport?.psychotherapyMinutes);
  const crisisStart = compact(encounterSupport?.crisisStartTime);
  const crisisEnd = compact(encounterSupport?.crisisEndTime);

  if (totalMinutes) {
    signals.add(`Total encounter minutes documented in structured support: ${totalMinutes}.`);
  }

  if (psychotherapyMinutes) {
    signals.add(`Psychotherapy minutes documented in structured support: ${psychotherapyMinutes}.`);
  }

  if (crisisStart || crisisEnd) {
    signals.add(`Crisis timing documented in structured support: ${crisisStart || '?'} to ${crisisEnd || '?'}.`);
  }

  return Array.from(signals);
}

function addCandidate(candidates: CptRecommendationCandidate[], candidate: CptRecommendationCandidate) {
  candidates.push({
    ...candidate,
    cautions: [
      ...candidate.cautions,
      'Treat this as a coding-review candidate, not a final CPT assignment.',
    ],
  });
}

export function evaluateCptSupport(sourceText: string): CptSupportAssessment {
  const normalized = sourceText.toLowerCase();
  const psychotherapyContent = hasPsychotherapyContent(normalized);
  const medicationManagement = hasMedicationManagement(normalized);
  const timeDocumented = hasMatch(normalized, [/\b\d+\s*(min|mins|minute|minutes)\b/]);
  const complexityRisk = hasMatch(normalized, [/\b(suicid|homicid|psychosis|grave disability|crisis|unable to contract for safety)\b/]);

  const documentationElements: string[] = [];
  const timeHints: string[] = [];
  const riskComplexityIndicators: string[] = [];
  const cautions: string[] = [
    'Do not present CPT or billing family selection as definitive based on partial source alone.',
    'If required documentation is missing, highlight that gap instead of inventing it.',
  ];

  if (psychotherapyContent) {
    documentationElements.push('Distinct psychotherapy content is documented.');
  } else {
    documentationElements.push('Psychotherapy content is not clearly distinct yet.');
  }

  if (medicationManagement) {
    documentationElements.push('Medical / prescribing work appears documented.');
  }

  if (timeDocumented) {
    timeHints.push('Time-based documentation is present and can support family-specific review.');
  } else {
    timeHints.push('Time-based documentation is not clearly visible; avoid implying time-dependent billing support.');
  }

  if (complexityRisk) {
    riskComplexityIndicators.push('Risk-sensitive content may support higher documentation complexity if clearly described.');
  } else {
    riskComplexityIndicators.push('Complexity support may be thin without documented risk, instability, or treatment-decision detail.');
  }

  const summary = medicationManagement && psychotherapyContent
    ? 'The source may support a combined medical-management plus psychotherapy documentation review, but billing certainty should remain provisional.'
    : medicationManagement
      ? 'The source reads more like medical-management / E/M support than psychotherapy-only support.'
      : psychotherapyContent
        ? 'The source may support psychotherapy-family review if timing and distinct therapy content are adequately documented.'
        : 'Documentation is too thin to support confident CPT-family guidance.';

  return {
    summary,
    documentationElements,
    timeHints,
    riskComplexityIndicators,
    cautions,
  };
}

export function evaluatePostNoteCptRecommendations(
  input: PostNoteCptRecommendationInput,
): PostNoteCptRecommendationAssessment {
  const completedNoteText = compact(input.completedNoteText);
  const noteType = compact(input.noteType);
  const normalizedNote = normalize(completedNoteText);
  const evidenceNote = stripExplicitMissingCptSignals(normalizedNote);
  const normalizedNoteType = normalize(noteType);
  const encounterSupport = input.encounterSupport;
  const candidates: CptRecommendationCandidate[] = [];
  const timeSignals = extractMinuteSignals(completedNoteText, encounterSupport);
  const continuityRecallContext = hasContinuityRecallContext(completedNoteText);
  const continuityOnlyReview = continuityRecallContext && !hasCurrentEncounterCodingSupport(evidenceNote);

  const psychotherapyContent = hasPsychotherapyContent(evidenceNote);
  const medicationManagement = hasMedicationManagement(evidenceNote);
  const mdmSupport = hasMdmSupport(evidenceNote);
  const crisisWork = hasCrisisWork(evidenceNote) || /crisis/i.test(noteType);
  const evaluationWork = hasEvaluationWork(evidenceNote, noteType);
  const communicationComplexity = hasCommunicationComplexity(evidenceNote)
    || Boolean(encounterSupport?.interactiveComplexity);
  const telehealthContext = /telehealth|video|audio-only|audio only|virtual/i.test(`${noteType} ${completedNoteText}`)
    || Boolean(encounterSupport?.telehealthModality && encounterSupport.telehealthModality !== 'not-applicable');
  const psychotherapyTimeDocumented = Boolean(compact(encounterSupport?.psychotherapyMinutes))
    || /\b(psychotherapy|therapy)\s*(?:time|minutes|min)?[:\s-]*\d{1,3}\s*(?:min|mins|minute|minutes)\b/i.test(completedNoteText);
  const totalTimeDocumented = Boolean(compact(encounterSupport?.totalMinutes)) || timeSignals.length > 0;

  if (!completedNoteText) {
    return {
      summary: 'No completed note text is available for CPT support review.',
      candidates: [],
      documentationReadiness: {
        status: 'too-thin',
        presentElements: [],
        missingElements: ['Completed note text is required before Veranote can produce coding-support candidates.'],
      },
      timeSignals: [],
      missingGlobalElements: ['Completed note text is required before Veranote can produce coding-support candidates.'],
      guardrails: [
        'Do not recommend a CPT family without completed note text.',
        'Final code selection must be verified against current CPT, payer, facility, and clinician documentation requirements.',
      ],
    };
  }

  if (continuityOnlyReview) {
    return {
      summary: 'Prior continuity context alone is too thin for meaningful CPT-support candidates.',
      candidates: [],
      documentationReadiness: {
        status: 'too-thin',
        presentElements: ['Prior Veranote continuity context is present.'],
        missingElements: [
          'Today\'s encounter work is not clearly documented.',
          'Do not use copied-forward or recalled prior-note content alone to support a code family.',
          'Final selection requires current CPT/payer/facility review and the provider/coder of record.',
        ],
      },
      timeSignals,
      missingGlobalElements: [
        'Prior continuity context must be confirmed and tied to today\'s encounter before coding-support review.',
        'Encounter family is not clear from the completed note text.',
        'Final selection requires current CPT/payer/facility review and the provider/coder of record.',
      ],
      guardrails: [
        'These are possible CPT-support candidates, not definitive billing recommendations.',
        'Veranote can surface documentation support and missing elements, but it does not select the final CPT level.',
        'Never add or rewrite clinical facts just to support a code.',
        'Do not infer a CPT family from prior continuity context, copied-forward material, note type, diagnosis, or destination EHR alone.',
        'Verify against current CPT, payer, facility, telehealth, and state-specific requirements before billing.',
      ],
    };
  }

  if (evaluationWork) {
    addCandidate(candidates, {
      family: 'Psychiatric diagnostic evaluation family',
      candidateCodes: ['90791', '90792'],
      strength: medicationManagement ? 'possible-review' : 'stronger-documentation-support',
      why: [
        'The note reads like an intake or diagnostic-evaluation encounter.',
        medicationManagement
          ? 'Medical services or prescribing language appears present, so 90791 versus 90792 needs coding review.'
          : 'The note does not clearly show medical services in the evaluation text reviewed here.',
      ],
      missingElements: [
        ...(medicationManagement ? [] : ['If medical services occurred, they must be documented rather than inferred.']),
        'Confirm payer/facility rules and whether this was a diagnostic evaluation versus another encounter family.',
      ],
      cautions: [
        'Do not convert a follow-up note into an intake/evaluation family unless the encounter truly supports that family.',
      ],
    });
  }

  if (medicationManagement) {
    addCandidate(candidates, {
      family: 'Office / outpatient E/M family',
      candidateCodes: ['99202-99205', '99212-99215'],
      strength: totalTimeDocumented || mdmSupport
        ? 'stronger-documentation-support'
        : 'possible-review',
      why: [
        'Medication-management or prescribing work appears documented.',
        totalTimeDocumented
          ? 'Time or encounter-duration support is visible for coding review.'
          : mdmSupport
            ? 'Medical decision-making cues are visible, but the exact E/M level still needs coding review.'
            : 'No clear time or medical decision-making support is visible, so E/M level confidence should stay low.',
      ],
      missingElements: [
        'Current E/M level still depends on current time or MDM rules and payer-specific requirements.',
        ...(!totalTimeDocumented ? ['If using time, total time must be documented clearly.'] : []),
        ...(!mdmSupport ? ['If using MDM, problem status, data reviewed, and treatment-risk detail should be visible rather than inferred.'] : []),
      ],
      cautions: [
        'Do not select a specific E/M level from this helper alone.',
      ],
    });
  }

  if (medicationManagement && psychotherapyContent) {
    addCandidate(candidates, {
      family: 'Psychotherapy add-on with E/M family',
      candidateCodes: ['90833', '90836', '90838'],
      strength: psychotherapyTimeDocumented ? 'stronger-documentation-support' : 'possible-review',
      why: [
        'The note includes both medical-management language and psychotherapy content.',
        psychotherapyTimeDocumented
          ? 'Separate psychotherapy time appears documented.'
          : 'Psychotherapy time is not clearly documented yet.',
      ],
      missingElements: [
        ...(!psychotherapyTimeDocumented ? ['Separate psychotherapy minutes are needed before implying add-on support.'] : []),
        'Psychotherapy content should be distinct from medication counseling or routine education.',
      ],
      cautions: [
        'Supportive counseling phrases alone should not create a psychotherapy add-on candidate.',
      ],
    });
  }

  if (!medicationManagement && (psychotherapyContent || /therapy/i.test(normalizedNoteType))) {
    addCandidate(candidates, {
      family: 'Psychotherapy-only family',
      candidateCodes: ['90832', '90834', '90837'],
      strength: psychotherapyTimeDocumented ? 'stronger-documentation-support' : 'possible-review',
      why: [
        'The note reads like psychotherapy without obvious medical-management work.',
        psychotherapyTimeDocumented
          ? 'Psychotherapy time appears documented.'
          : 'Psychotherapy time is not clearly documented yet.',
      ],
      missingElements: [
        ...(!psychotherapyContent ? ['Specific psychotherapy interventions or therapy content are not clear.'] : []),
        ...(!psychotherapyTimeDocumented ? ['Psychotherapy minutes should be documented if using psychotherapy family review.'] : []),
      ],
      cautions: [
        'Do not treat attendance, check-in, or generic support language as psychotherapy content by itself.',
      ],
    });
  }

  if (crisisWork) {
    const crisisTiming = Boolean(compact(encounterSupport?.crisisStartTime) || compact(encounterSupport?.crisisEndTime))
      || /\bcrisis\b.{0,60}\b\d{1,3}\s*(?:min|mins|minute|minutes)\b/i.test(completedNoteText);

    addCandidate(candidates, {
      family: 'Psychotherapy for crisis family',
      candidateCodes: ['90839', '90840'],
      strength: crisisTiming ? 'possible-review' : 'insufficient-support',
      why: [
        'The note contains crisis, safety, suicidal/homicidal, or acute-risk language.',
        crisisTiming
          ? 'Crisis timing appears visible for coding review.'
          : 'Crisis timing is not clearly visible.',
      ],
      missingElements: [
        ...(!crisisTiming ? ['Crisis psychotherapy timing must be documented before implying crisis-family support.'] : []),
        'Crisis intervention content should be concrete and source-supported.',
      ],
      cautions: [
        'Urgency or risk language alone should not be treated as crisis psychotherapy support.',
      ],
    });
  }

  if (communicationComplexity) {
    addCandidate(candidates, {
      family: 'Interactive complexity add-on review',
      candidateCodes: ['90785'],
      strength: compact(encounterSupport?.interactiveComplexityReason) || hasCommunicationComplexity(normalizedNote)
        ? 'possible-review'
        : 'insufficient-support',
      why: [
        'Interactive complexity or communication-barrier context was detected.',
      ],
      missingElements: [
        'The note should name the actual communication factor or third-party dynamic that changed the work.',
      ],
      cautions: [
        'A difficult visit, acuity, family presence, or collateral contact alone is not enough.',
      ],
    });
  }

  if (telehealthContext) {
    addCandidate(candidates, {
      family: 'Telehealth billing/modifier review',
      candidateCodes: ['payer-specific modifier/POS review'],
      strength: encounterSupport?.telehealthConsent || /consent/i.test(completedNoteText)
        ? 'possible-review'
        : 'insufficient-support',
      why: [
        'Telehealth or remote-visit context appears present.',
      ],
      missingElements: [
        ...(!encounterSupport?.telehealthConsent && !/consent/i.test(completedNoteText) ? ['Telehealth consent is not clearly documented.'] : []),
        ...(!compact(encounterSupport?.patientLocation) && !/patient location/i.test(completedNoteText) ? ['Patient location is not clearly documented.'] : []),
        'Payer-specific modifier, place-of-service, and platform requirements must be verified.',
      ],
      cautions: [
        'Telehealth rules vary by payer and date; do not infer modifier/POS from this helper alone.',
      ],
    });
  }

  const missingGlobalElements = [
    ...(continuityRecallContext ? ['Prior continuity context is present; confirm it is documented as prior, confirmed today, or conflicting with today before coding-support review.'] : []),
    ...(!timeSignals.length ? ['No clear time signal was found; avoid time-dependent code confidence.'] : []),
    ...(!medicationManagement && !psychotherapyContent && !evaluationWork && !crisisWork
      ? ['Encounter family is not clear from the completed note text.'] : []),
    'Final selection requires current CPT/payer/facility review and the provider/coder of record.',
  ];

  const summary = candidates.length
    ? `Veranote found ${candidates.length} possible CPT-support candidate family${candidates.length === 1 ? '' : 'ies'} to review after note completion.`
    : 'The completed note is too thin for meaningful CPT-support candidates.';

  const presentReadinessElements = [
    completedNoteText ? 'Completed note text is available.' : '',
    evaluationWork ? 'Evaluation/intake structure is visible.' : '',
    medicationManagement ? 'Medication-management or prescribing work is visible.' : '',
    mdmSupport ? 'Medical decision-making support cues are visible.' : '',
    psychotherapyContent ? 'Distinct psychotherapy or therapy content is visible.' : '',
    psychotherapyTimeDocumented ? 'Separate psychotherapy time is visible.' : '',
    totalTimeDocumented ? 'Total encounter time is visible.' : '',
    crisisWork ? 'Crisis or acute-risk content is visible.' : '',
    communicationComplexity ? 'Interactive complexity or communication-barrier context is visible.' : '',
    telehealthContext ? 'Telehealth context is visible.' : '',
    encounterSupport?.telehealthConsent || /consent/i.test(completedNoteText) ? 'Telehealth consent support is visible.' : '',
    compact(encounterSupport?.patientLocation) || /patient location/i.test(completedNoteText) ? 'Patient location support is visible.' : '',
  ].filter(Boolean);

  const readinessMissingElements = [
    ...(!totalTimeDocumented ? ['Total encounter time is not clearly documented if time-based review is intended.'] : []),
    ...(medicationManagement && !mdmSupport ? ['Medical decision-making support is not clearly documented if MDM-based review is intended.'] : []),
    ...(psychotherapyContent && !psychotherapyTimeDocumented ? ['Separate psychotherapy minutes are not clearly documented.'] : []),
    ...(crisisWork && !timeSignals.some((item) => /crisis/i.test(item)) && !compact(encounterSupport?.crisisStartTime) && !compact(encounterSupport?.crisisEndTime)
      ? ['Crisis timing is not clearly documented if crisis psychotherapy family review is intended.']
      : []),
    ...(telehealthContext && !encounterSupport?.telehealthConsent && !/consent/i.test(completedNoteText) ? ['Telehealth consent is not clearly documented.'] : []),
    ...(telehealthContext && !compact(encounterSupport?.patientLocation) && !/patient location/i.test(completedNoteText) ? ['Patient location is not clearly documented.'] : []),
    ...(!medicationManagement && !psychotherapyContent && !evaluationWork && !crisisWork
      ? ['Encounter family is not clear from the completed note text.']
      : []),
    'Specific level/code still requires coder/provider review against current CPT, payer, facility, telehealth, and state rules.',
  ];

  const documentationReadiness = {
    status: !candidates.length
      ? 'too-thin' as const
      : candidates.some((candidate) => candidate.strength === 'stronger-documentation-support') && readinessMissingElements.length <= 3
        ? 'review-candidate' as const
        : 'needs-review' as const,
    presentElements: presentReadinessElements,
    missingElements: readinessMissingElements,
  };

  return {
    summary,
    candidates,
    documentationReadiness,
    timeSignals,
    missingGlobalElements,
    guardrails: [
      'These are possible CPT-support candidates, not definitive billing recommendations.',
      'Veranote can surface documentation support and missing elements, but it does not select the final CPT level.',
      'Never add or rewrite clinical facts just to support a code.',
      'Do not infer a CPT level from diagnosis, note type, template choice, or destination EHR alone.',
      'Do not infer billing from prior continuity context unless today\'s encounter documentation independently justifies review.',
      'Verify against current CPT, payer, facility, telehealth, and state-specific requirements before billing.',
      'If documentation is thin or contradictory, show the gap rather than forcing a code family.',
    ],
  };
}
