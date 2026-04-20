export type MedicalNecessityCue = {
  id: string;
  label: string;
  detail: string;
  jurisdiction: 'national' | 'louisiana';
};

export type MedicalNecessityDomainScore = {
  id: 'imminent-risk' | 'recent-escalation' | 'adl-impairment' | 'failed-lower-levels' | 'need-24-hour-care';
  label: string;
  score: 0 | 1 | 2;
  detail: string;
};

export type MedicalNecessitySupport = {
  applies: boolean;
  totalScore: number;
  status: 'high-denial-risk' | 'borderline' | 'likely-approval' | 'strong-approval-case';
  statusLabel: string;
  statusToneClassName: string;
  nationalCues: MedicalNecessityCue[];
  louisianaCues: MedicalNecessityCue[];
  louisianaBoosts: string[];
  domainScores: MedicalNecessityDomainScore[];
  reviewWarnings: string[];
};

const EMPTY_SUPPORT: MedicalNecessitySupport = {
  applies: false,
  totalScore: 0,
  status: 'high-denial-risk',
  statusLabel: 'Not active for this note type',
  statusToneClassName: 'border-slate-200 bg-slate-50 text-slate-900',
  nationalCues: [],
  louisianaCues: [],
  louisianaBoosts: [],
  domainScores: [],
  reviewWarnings: [],
};

export function evaluateMedicalNecessitySupport(input: { noteType: string; draftText: string }): MedicalNecessitySupport {
  if (!looksLikeInpatientPsychNote(input.noteType)) {
    return EMPTY_SUPPORT;
  }

  const loweredDraft = input.draftText.toLowerCase();
  const domainScores: MedicalNecessityDomainScore[] = [
    scoreImminentRisk(loweredDraft),
    scoreRecentEscalation(loweredDraft),
    scoreAdlImpairment(loweredDraft),
    scoreFailedLowerLevels(loweredDraft),
    scoreNeedFor24HourCare(loweredDraft),
  ];

  const louisianaBoosts = buildLouisianaBoosts(loweredDraft);
  const totalScore = domainScores.reduce((sum, item) => sum + item.score, 0) + louisianaBoosts.length;
  const status = resolveStatus(totalScore);
  const nationalCues = buildNationalCues(domainScores, loweredDraft);
  const louisianaCues = buildLouisianaCues(domainScores, loweredDraft, louisianaBoosts);

  return {
    applies: true,
    totalScore,
    status,
    statusLabel: resolveStatusLabel(status),
    statusToneClassName: resolveStatusToneClassName(status),
    nationalCues,
    louisianaCues,
    louisianaBoosts,
    domainScores,
    reviewWarnings: [
      ...nationalCues.map((cue) => cue.label),
      ...louisianaCues.map((cue) => cue.label),
    ].slice(0, 5),
  };
}

function looksLikeInpatientPsychNote(noteType: string) {
  return /inpatient psych|psychiatric admission|behavioral health admission|psych progress/i.test(noteType || '');
}

function scoreImminentRisk(text: string): MedicalNecessityDomainScore {
  const strong =
    /\b(suicid(?:e|al)|homicid(?:e|al)|self-harm|self harm|overdose|attempted hanging|recent attempt|violence|assaultive)\b/.test(text)
    && /\b(plan|intent|means|tonight|today|access confirmed|attempted|recent)\b/.test(text);
  const moderate =
    /\b(suicid(?:e|al)|homicid(?:e|al)|unsafe|high risk|psychosis|agitation|self-harm|self harm)\b/.test(text);

  return {
    id: 'imminent-risk',
    label: 'Imminent risk',
    score: strong ? 2 : moderate ? 1 : 0,
    detail: strong
      ? 'The draft shows concrete risk language with plan, intent, means, or recent dangerous behavior.'
      : moderate
        ? 'Risk is mentioned, but the draft may still need more observable or time-anchored detail.'
        : 'No clear imminent-risk anchor is visible yet.',
  };
}

function scoreRecentEscalation(text: string): MedicalNecessityDomainScore {
  const strong =
    /\b(24 hours|48 hours|72 hours|today|yesterday|2 days ago|3 days ago|this week|returned|again)\b/.test(text)
    && /\b(worse|worsening|escalat|attempt|ed visit|emergency department|law enforcement|crisis)\b/.test(text);
  const moderate =
    /\b(recent|lately|worse|worsening|escalat|declin|decompensat)\b/.test(text);

  return {
    id: 'recent-escalation',
    label: 'Recent escalation',
    score: strong ? 2 : moderate ? 1 : 0,
    detail: strong
      ? 'The draft explains why admission is needed now with a recent timeline or acute escalation.'
      : moderate
        ? 'There is some worsening language, but the timeline still looks thin.'
        : 'Why-now timeline support is not clearly visible yet.',
  };
}

function scoreAdlImpairment(text: string): MedicalNecessityDomainScore {
  const strong =
    /\b(not eating|has not eaten|not showering|poor hygiene|staying in bed|unable to manage medications|missed \d+ days|unable to state address|unable to obtain shelter|wandering|cannot care for self)\b/.test(text);
  const moderate =
    /\b(adl|poor functioning|grave disability|not caring for self|hygiene poor|medication nonadherence|sleeping .* hours|functional impairment)\b/.test(text);

  return {
    id: 'adl-impairment',
    label: 'ADL impairment',
    score: strong ? 2 : moderate ? 1 : 0,
    detail: strong
      ? 'Functional or ADL impairment is concrete and observable in the draft.'
      : moderate
        ? 'Impairment is suggested, but it may still read too general for review support.'
        : 'Concrete ADL or functional impairment is not clearly documented yet.',
  };
}

function scoreFailedLowerLevels(text: string): MedicalNecessityDomainScore {
  const strong =
    /\b(outpatient|iop|php|safety plan|crisis stabilization|ed visit|emergency department|discharged)\b/.test(text)
    && /\b(failed|returned|worsening|not enough|insufficient|did not stabilize|still decompensated)\b/.test(text);
  const moderate =
    /\b(outpatient|iop|php|safety plan|therapy|medication adjustment|crisis)\b/.test(text);

  return {
    id: 'failed-lower-levels',
    label: 'Failed lower levels of care',
    score: strong ? 2 : moderate ? 1 : 0,
    detail: strong
      ? 'The draft shows recent less-restrictive attempts and why they failed.'
      : moderate
        ? 'Lower-level care is mentioned, but the failure to stabilize may not be explicit enough.'
        : 'Less-restrictive care attempts or failure history are not clearly documented yet.',
  };
}

function scoreNeedFor24HourCare(text: string): MedicalNecessityDomainScore {
  const strong =
    /\b(24 hour|24-hour|inpatient|q15|15 minute checks|constant observation|close observation|cannot be managed outpatient|less restrictive .* insufficient|requires supervision)\b/.test(text);
  const moderate =
    /\b(admit|admission|stabilization|monitoring|observation|structured environment)\b/.test(text);

  return {
    id: 'need-24-hour-care',
    label: 'Need for 24-hour care',
    score: strong ? 2 : moderate ? 1 : 0,
    detail: strong
      ? 'The draft explains why 24-hour inpatient treatment is necessary instead of lower levels of care.'
      : moderate
        ? 'Inpatient need is implied, but the less-restrictive boundary may still need to be clearer.'
        : 'The note does not yet clearly justify why inpatient 24-hour care is required.',
  };
}

function buildLouisianaBoosts(text: string) {
  const boosts: string[] = [];

  if (/\b(unable to eat|unable to bathe|unable to obtain shelter|unable to state address|wandering|cannot care for self|grave disability)\b/.test(text)) {
    boosts.push('Grave disability is documented with objective basic-needs or self-care impairment.');
  }

  if (/\b(ed visit|emergency department|prior admission|admitted|law enforcement|police|crisis line|mobile crisis)\b/.test(text)) {
    boosts.push('Recent utilization or crisis-system contact is visible in the draft.');
  }

  if (/\b(off meds|off medications|medication nonadherence|missed \d+ days|stopped lithium|stopped medication)\b/.test(text)) {
    boosts.push('Medication nonadherence contributing to acute instability is visible in the draft.');
  }

  return boosts;
}

function buildNationalCues(domainScores: MedicalNecessityDomainScore[], text: string) {
  const cues: MedicalNecessityCue[] = [];

  const risk = domainScores.find((item) => item.id === 'imminent-risk');
  if (risk && risk.score < 2) {
    cues.push({
      id: 'national-risk-specificity',
      jurisdiction: 'national',
      label: 'Risk language may still be too vague for inpatient review',
      detail: 'Move beyond unsafe or high risk. Add plan, intent, means, recent behaviors, or reality-testing failure if those facts are truly present.',
    });
  }

  const escalation = domainScores.find((item) => item.id === 'recent-escalation');
  if (escalation && escalation.score < 2) {
    cues.push({
      id: 'national-why-now',
      jurisdiction: 'national',
      label: 'Why-now timeline may be thin',
      detail: 'Include dates, recent attempts, ED returns, acute worsening, or other recent escalation so the need for admission reads current instead of chronic.',
    });
  }

  const lowerLevels = domainScores.find((item) => item.id === 'failed-lower-levels');
  if (lowerLevels && lowerLevels.score < 2) {
    cues.push({
      id: 'national-lower-level-failure',
      jurisdiction: 'national',
      label: 'Failure of less-restrictive care may not be explicit yet',
      detail: 'Show what was tried, when it was tried, and why outpatient, crisis, IOP, PHP, or safety-planning efforts did not stabilize the patient.',
    });
  }

  const adl = domainScores.find((item) => item.id === 'adl-impairment');
  if (adl && adl.score < 2) {
    cues.push({
      id: 'national-adl-impairment',
      jurisdiction: 'national',
      label: 'ADL or functional impairment could be more concrete',
      detail: 'Use observed or reported deficits like not eating, hygiene decline, medication-management failure, or inability to remain safe independently.',
    });
  }

  const need24Hour = domainScores.find((item) => item.id === 'need-24-hour-care');
  if (need24Hour && need24Hour.score < 2) {
    cues.push({
      id: 'national-24-hour-care',
      jurisdiction: 'national',
      label: 'Need for 24-hour care is not yet clearly defended',
      detail: 'Make the lower-level boundary visible. Explain why outpatient or other less-restrictive care cannot safely manage this presentation now.',
    });
  }

  if (/\bunsafe|for structure|for stabilization\b/.test(text) && !/\bplan|intent|means|attempt|ed visit|outpatient|adl|hygiene|24-hour\b/.test(text)) {
    cues.push({
      id: 'national-vague-phrasing',
      jurisdiction: 'national',
      label: 'Vague medical-necessity phrasing may trigger denial',
      detail: 'Phrases like unsafe, for structure, or for stabilization need objective examples, dates, and failed-care context behind them.',
    });
  }

  return cues.slice(0, 5);
}

function buildLouisianaCues(domainScores: MedicalNecessityDomainScore[], text: string, louisianaBoosts: string[]) {
  const cues: MedicalNecessityCue[] = [];
  const risk = domainScores.find((item) => item.id === 'imminent-risk');
  const need24Hour = domainScores.find((item) => item.id === 'need-24-hour-care');
  const escalation = domainScores.find((item) => item.id === 'recent-escalation');

  if ((risk?.score || 0) < 2 && !/\bgrave disability\b/.test(text)) {
    cues.push({
      id: 'louisiana-severity-of-illness',
      jurisdiction: 'louisiana',
      label: 'Louisiana severity-of-illness support may be light',
      detail: 'Louisiana inpatient reviews usually need a concrete acute-risk or grave-disability anchor, not only chronic symptom burden.',
    });
  }

  if ((need24Hour?.score || 0) < 2) {
    cues.push({
      id: 'louisiana-intensity-of-service',
      jurisdiction: 'louisiana',
      label: 'Louisiana intensity-of-service support may be incomplete',
      detail: 'Show why 24-hour psychiatric treatment, observation, or supervised intervention is required and not available in a lower level of care.',
    });
  }

  if (/\bgrave disability\b/.test(text) && !/\b(unable to eat|unable to bathe|unable to obtain shelter|unable to state address|wandering|cannot care for self)\b/.test(text)) {
    cues.push({
      id: 'louisiana-grave-disability-proof',
      jurisdiction: 'louisiana',
      label: 'Grave disability is named, but proof may be too thin',
      detail: 'Louisiana reviewers generally expect objective basic-needs examples rather than the label alone.',
    });
  }

  if ((escalation?.score || 0) < 2 && !louisianaBoosts.some((item) => /utilization|crisis-system/.test(item))) {
    cues.push({
      id: 'louisiana-utilization-history',
      jurisdiction: 'louisiana',
      label: 'Recent utilization or acute-worsening history could help this case',
      detail: 'If present, include ED visits, crisis calls, law-enforcement involvement, prior admissions, or other recent failed stabilization attempts with dates.',
    });
  }

  return cues.slice(0, 4);
}

function resolveStatus(totalScore: number): MedicalNecessitySupport['status'] {
  if (totalScore >= 10) {
    return 'strong-approval-case';
  }
  if (totalScore >= 7) {
    return 'likely-approval';
  }
  if (totalScore >= 4) {
    return 'borderline';
  }
  return 'high-denial-risk';
}

function resolveStatusLabel(status: MedicalNecessitySupport['status']) {
  switch (status) {
    case 'strong-approval-case':
      return 'Strong approval case';
    case 'likely-approval':
      return 'Likely approval';
    case 'borderline':
      return 'Borderline';
    default:
      return 'High denial risk';
  }
}

function resolveStatusToneClassName(status: MedicalNecessitySupport['status']) {
  switch (status) {
    case 'strong-approval-case':
      return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    case 'likely-approval':
      return 'border-lime-200 bg-lime-50 text-lime-900';
    case 'borderline':
      return 'border-amber-200 bg-amber-50 text-amber-900';
    default:
      return 'border-rose-200 bg-rose-50 text-rose-900';
  }
}
