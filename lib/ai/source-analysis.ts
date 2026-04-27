import type { CopilotSuggestion, SourceSections } from '@/types/session';

export function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export type SourceConstraintSummary = {
  normalizedSource: string;
  wordCount: number;
  sourceIsSparse: boolean;
  sourceIsVerySparse: boolean;
  sourceHasExplicitPlan: boolean;
  sourceOnlyHasRefillOrContinuePlan: boolean;
  sourceHasRefillRequest: boolean;
  sourceHasSupportivePlanVerbs: boolean;
  sourceHasSafetySupportLanguage: boolean;
  sourceHasTherapyInterventionWithoutClearEffect: boolean;
  sourceHasMinimalStatusLanguage: boolean;
  sourceHasExplicitNoSiOrRiskLine: boolean;
  sourceHasConflictSignals: boolean;
  sourceHasTranscriptClinicianConflict: boolean;
  sourceHasSubstanceConflict: boolean;
  sourceHasPsychosisObservationConflict: boolean;
  sourceHasMedicationContent: boolean;
  sourceHasMedicationConflict: boolean;
  sourceHasMedicationAdherenceUncertainty: boolean;
  sourceHasMedicationSideEffectUncertainty: boolean;
  sourceHasMedicationRefillWithoutDecision: boolean;
  sourceHasTimelineAnchors: boolean;
  sourceHasPartialImprovementLanguage: boolean;
  sourceHasPassiveDeathWishNuance: boolean;
  sourceHasViolenceRiskNuance: boolean;
  sourceHasObjectiveNarrativeMismatch: boolean;
};

export function summarizeSourceConstraints(sourceInput: string): SourceConstraintSummary {
  const normalizedSource = normalizeText(sourceInput).toLowerCase();
  const wordCount = normalizedSource ? normalizedSource.split(' ').filter(Boolean).length : 0;
  const sourceIsSparse = wordCount > 0 && wordCount <= 90;
  const sourceIsVerySparse = wordCount > 0 && wordCount <= 45;
  const sourceHasExplicitPlan = /(plan:|follow up|follow-up|return in|rtc|continue current plan|continue current precautions|continue current regimen|refill|needs refill|will call|crisis line|support resources|monitor|safety planning|safety plan|reviewed|discussed|escalation threshold|mobile crisis|accompanied|stayed with)/i.test(sourceInput);
  const sourceHasRefillRequest = /(needs refill|refill requested|requests? (?:a )?refill)/i.test(sourceInput);
  const sourceOnlyHasRefillOrContinuePlan = !/(increase|decrease|start|stop|switch|taper|recommend|encourage|reviewed coping|homework|safety planning|hospitali[sz]|labs?|therapy weekly|precautions)/i.test(sourceInput)
    && /(needs refill|refill|continue current plan|continue current regimen|follow up|follow-up|return in|rtc|will call aunt|will call .* crisis line|crisis line)/i.test(sourceInput);
  const sourceHasSupportivePlanVerbs = /(monitor|encourage|supportive care|hydration|coping strategies|future sessions|safety plan|safety planning|use supports|return precautions|mobile crisis|reviewed|discussed|escalation threshold)/i.test(sourceInput);
  const sourceHasSafetySupportLanguage = /(will call|crisis line|aunt|support resources|if thoughts intensify|support person|stayed with|accompanied|mobile crisis)/i.test(sourceInput);
  const sourceHasTherapyInterventionWithoutClearEffect = /(grounding|breathing|coping skill|intervention|exercise|reframing)/i.test(sourceInput)
    && /(didn[’']?t really help|did not really help|wasn[’']?t doing much|without clear benefit|not helpful|didn[’']?t help much|did not help much|not sure it helped|unclear benefit)/i.test(sourceInput);
  const sourceHasMinimalStatusLanguage = /("about the same"|about the same|nothing major changed|no major change)/i.test(sourceInput);
  const sourceHasExplicitNoSiOrRiskLine = /(no si reported|denies si|no si\b|denies suicidal ideation|denies suicidality|denies plan, intent|denies plan and intent|denies hi|no hi\b|no self-harm|denies self-harm|hasn[’']?t done anything to hurt myself|didn[’']?t do anything to hurt myself|no safety concerns reported|no acute safety concerns)/i.test(sourceInput);
  const sourceHasTranscriptClinicianConflict = /(### clinician note[\s\S]*no self-harm reported[\s\S]*### transcript[\s\S]*(cut my|cutting|cut .* with a razor|hurt myself))/i.test(sourceInput);
  const sourceHasSubstanceConflict = /((denies recent cocaine use|didn[’']?t use anything|denies .*substance|denies .*drug use)[\s\S]*(urine drug screen positive|uds positive|positive for cocaine|girlfriend reports|collateral))/i.test(sourceInput)
    || /((urine drug screen positive|uds positive|positive for cocaine|girlfriend reports|collateral)[\s\S]*(denies recent cocaine use|didn[’']?t use anything|denies .*substance|denies .*drug use))/i.test(sourceInput);
  const sourceHasPsychosisObservationConflict = /((denies ah\/vh|no, i['’]m not hearing voices|denies hallucinations)[\s\S]*(internally preoccupied|laughing to self|staring intermittently|look toward the corner|responding to internal stimuli))/i.test(sourceInput)
    || /((internally preoccupied|laughing to self|staring intermittently|look toward the corner|responding to internal stimuli)[\s\S]*(denies ah\/vh|no, i['’]m not hearing voices|denies hallucinations))/i.test(sourceInput);
  const sourceHasMedicationContent = /(medication list|current meds?|current medication|sertraline|escitalopram|fluoxetine|clonazepam|lamotrigine|trazodone|olanzapine|haloperidol|risperidone|amlodipine|metformin|\bmg\b|\bmcg\b|\bqhs\b|\bbid\b|\btid\b|\bprn\b|refill)/i.test(sourceInput);
  const sourceHasMedicationConflict = /((medication list still shows|medication list shows|chart.*shows|mar shows|not yet updated|pharmacy refill history not reviewed)[\s\S]*(patient says|patient reports|reports staying on|actually kept taking|never went up|stopped .* on her own|stopped .* on his own|stopped .* on their own|takes? .* most days|missed .* pill))/i.test(sourceInput)
    || /((patient says|patient reports|reports staying on|actually kept taking|never went up|stopped .* on her own|stopped .* on his own|stopped .* on their own|takes? .* most days|missed .* pill)[\s\S]*(medication list still shows|medication list shows|chart.*shows|mar shows|not yet updated|pharmacy refill history not reviewed))/i.test(sourceInput)
    || /(increased .* from .* to|decreased .* from .* to)[\s\S]*(medication list still shows|not yet updated)/i.test(sourceInput);
  const sourceHasMedicationAdherenceUncertainty = /(most days|missed .* pill|forgot .* pill|reports taking .* differently|not taking as prescribed|has actually kept taking|never went up on it|stopped .* on (?:her|his|their) own)/i.test(sourceInput);
  const sourceHasMedicationSideEffectUncertainty = /(not sure whether .* medication-related|unclear whether .* medication-related|felt .* first few days|mostly gone now|temporary nausea|emotionally numb|side effect concern|plausible but not confirmed)/i.test(sourceInput);
  const sourceHasMedicationRefillWithoutDecision = /(needs refill|refill requested|requests? (?:a )?refill)/i.test(sourceInput)
    && !/(refill sent|refill provided|refill authorized|continue .* today|increase|decrease|restart|stop|switch)/i.test(sourceInput);
  const sourceHasTimelineAnchors = /(today|yesterday|tonight|this week|last week|last month|this month|over last|over the last|after first week|\d+ days ago|\d+ weeks ago|\d+ months ago|one month ago|two months ago|three days ago|last occurred)/i.test(sourceInput);
  const sourceHasPartialImprovementLanguage = /(a little better|helped some|mostly gone|decreased|down to|calmer today|still|not all the way there|better overall|improved after first week|partial improvement)/i.test(sourceInput);
  const sourceHasPassiveDeathWishNuance = /(wish i wouldn[’']?t wake up|wish i could disappear|wish i could not wake up|not wake up|passive death|passive si)/i.test(sourceInput)
    && /(denies plan|denies intent|don[’']?t want to kill myself|i[’']?m not trying to kill myself|denies si|not suicidal)/i.test(sourceInput);
  const sourceHasViolenceRiskNuance = /(wanting to punch|picture hitting|violent thoughts|homicid|want to hurt|intrusive thoughts)/i.test(sourceInput)
    && /(denies intent|denies plan|not going to do it|haven[’']?t planned anything|no recent assaultive behavior|weapon access)/i.test(sourceInput);
  const sourceHasObjectiveNarrativeMismatch = /(objective data|medication list still shows|medication list shows|mar shows|bp today:|urine drug screen positive|uds positive|nursing note|responding to internal stimuli|laughing to self|appeared internally preoccupied)/i.test(sourceInput)
    && /(patient says|patient reports|denies|better overall|calmer today|about the same|nothing major changed|follow-up for|transcript)/i.test(sourceInput);
  const sourceHasConflictSignals = sourceHasTranscriptClinicianConflict
    || sourceHasSubstanceConflict
    || sourceHasPsychosisObservationConflict
    || sourceHasMedicationConflict
    || sourceHasObjectiveNarrativeMismatch
    || (/(mother|father|spouse|girlfriend|boyfriend|wife|husband|collateral|nursing)/i.test(sourceInput) && /(patient says|patient reports|denies|transcript)/i.test(sourceInput));

  return {
    normalizedSource,
    wordCount,
    sourceIsSparse,
    sourceIsVerySparse,
    sourceHasExplicitPlan,
    sourceOnlyHasRefillOrContinuePlan,
    sourceHasRefillRequest,
    sourceHasSupportivePlanVerbs,
    sourceHasSafetySupportLanguage,
    sourceHasTherapyInterventionWithoutClearEffect,
    sourceHasMinimalStatusLanguage,
    sourceHasExplicitNoSiOrRiskLine,
    sourceHasConflictSignals,
    sourceHasTranscriptClinicianConflict,
    sourceHasSubstanceConflict,
    sourceHasPsychosisObservationConflict,
    sourceHasMedicationContent,
    sourceHasMedicationConflict,
    sourceHasMedicationAdherenceUncertainty,
    sourceHasMedicationSideEffectUncertainty,
    sourceHasMedicationRefillWithoutDecision,
    sourceHasTimelineAnchors,
    sourceHasPartialImprovementLanguage,
    sourceHasPassiveDeathWishNuance,
    sourceHasViolenceRiskNuance,
    sourceHasObjectiveNarrativeMismatch,
  };
}

export function extractExplicitDates(sourceInput: string) {
  const matches = sourceInput.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) ?? [];
  return Array.from(new Set(matches));
}

export function extractMissingInfoFlags(sourceInput: string, noteType: string) {
  const flags = new Set<string>();

  if (!/(follow-up|follow up|next visit|next session|return in|rtc|f\/u)/i.test(sourceInput)) {
    flags.add('Follow-up interval not documented.');
  }

  if (!/(side effect|side-effect|tolerat|adverse effect)/i.test(sourceInput)) {
    flags.add('Side effects not addressed.');
  }

  if (/psych|therapy/i.test(noteType) && !/(mse|mental status|affect|mood|thought process|insight|judgment|speech|eye contact|behavior|orientation)/i.test(sourceInput)) {
    flags.add('Mental status details are limited or not documented.');
  }

  if (/psych|therapy/i.test(noteType) && !/(si|suicid|hi|homicid|self-harm|safety|risk)/i.test(sourceInput)) {
    flags.add('Safety / risk details are limited or not documented.');
  }

  if (/medic|soap|consult|h&p/i.test(noteType) && !/(exam|objective|vitals|bp|hr|temp|physical exam|labs?)/i.test(sourceInput)) {
    flags.add('Objective findings are limited or not documented.');
  }

  if (!/(plan:|continue|follow up|follow-up|return|monitor|next|recommend|will)/i.test(sourceInput)) {
    flags.add('Plan details are limited or not documented.');
  }

  return Array.from(flags);
}

export function extractContradictionFlags(sourceInput: string) {
  const flags = new Set<string>();
  const text = sourceInput.toLowerCase();

  if (/(denies alcohol|no alcohol use|denies etoh)/i.test(sourceInput) && /(etoh positive|blood alcohol|bal\s*[:=]?\s*\d|alcohol positive)/i.test(sourceInput)) {
    flags.add('Possible contradiction: alcohol denial appears to conflict with documented alcohol-positive objective data.');
  }

  const hasSuicideDenial = /(denies si|no si|not suicidal)/i.test(sourceInput);
  const hasSelfHarmContext = /(overdose|od attempt|suicide attempt|cut\s|cutting|ingested pills|self-harm)/i.test(sourceInput);
  const selfHarmIsExplicitlyNegated = /(no recent self-harm|denies self-harm|denies any self-harm|hasn[’']?t done anything to hurt myself|didn[’']?t do anything to hurt myself|no self-injurious behavior|denies self-injurious behavior)/i.test(sourceInput);
  if (hasSuicideDenial && hasSelfHarmContext && !selfHarmIsExplicitlyNegated) {
    flags.add('Possible contradiction: denial of suicidality appears to conflict with documented overdose or self-harm context.');
  }

  if (/(no medical issues|medically clear|no pmh)/i.test(sourceInput) && /(glucose\s*(?:is|was|of)?\s*3\d\d|bp\s*(?:is|was|of)?\s*2\d\d|troponin positive|creatinine\s*(?:is|was|of)?\s*[2-9])/i.test(text)) {
    flags.add('Possible contradiction: minimal medical-history statement may conflict with materially abnormal objective data.');
  }

  if (/(calm|cooperative)/i.test(sourceInput) && /(agitated|aggression|violent|restraints|combative)/i.test(sourceInput)) {
    flags.add('Possible contradiction: calm/cooperative language appears alongside documented agitation, aggression, or restraints.');
  }

  return Array.from(flags);
}

export function buildCopilotSuggestions(input: { sourceInput: string; noteType: string; sourceSections?: SourceSections | null }) {
  const suggestions: CopilotSuggestion[] = [];
  const sourceInput = input.sourceInput;
  const sections = input.sourceSections;
  const constraints = summarizeSourceConstraints(sourceInput);

  if (!sections?.objectiveData?.trim()) {
    suggestions.push({
      title: 'Objective data section is empty',
      detail: 'If labs, vitals, medications, or other objective findings matter to this note, add them before finalizing the draft.',
      severity: 'review',
      basedOn: ['Objective data'],
    });
  }

  if (/psych|therapy/i.test(input.noteType) && !sections?.patientTranscript?.trim()) {
    suggestions.push({
      title: 'No patient conversation text provided',
      detail: 'If direct patient statements, symptom chronology, or interview details matter here, consider adding transcript or quote-level source material.',
      severity: 'info',
      basedOn: ['Conversation / transcript'],
    });
  }

  if (/passive si|suicid|self-harm|overdose|hopeless/i.test(sourceInput) && !/access to means|means|firearm|gun|weapon/i.test(sourceInput)) {
    suggestions.push({
      title: 'Risk language may need more detail',
      detail: 'The source includes suicidality or self-harm context, but access-to-means or related risk detail is not clearly documented.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Conversation / transcript'],
    });
  }

  if (/(wish i wouldn\'t wake up|wish i could disappear|wish i could not wake up|not wake up|passive death|passive si|wish i was dead)/i.test(sourceInput) && /(denies plan|denies intent|don\'t want to kill myself|i\'m not trying to kill myself|denies si|not suicidal)/i.test(sourceInput)) {
    suggestions.push({
      title: 'Passive death-wish nuance needs careful wording',
      detail: 'The source mixes passive death-wish language with denial of active plan/intent. Preserve that nuance instead of rounding it into either clean SI denial or active suicidality.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Conversation / transcript'],
    });
  }

  if (/(two months ago|last month|last week|yesterday|today|over last|after first week|weeks ago|months ago)/i.test(sourceInput)) {
    suggestions.push({
      title: 'Timeline-sensitive source',
      detail: 'This input includes explicit time anchors or old-vs-current symptom changes. Keep chronology visible during review so improvement does not get flattened or drift into the wrong timeframe.',
      severity: 'review',
      basedOn: ['Clinician notes', 'Conversation / transcript', 'Objective data'],
    });
  }

  if (constraints.sourceHasMedicationContent && !/side effect|tolerat|adverse effect/i.test(sourceInput)) {
    suggestions.push({
      title: 'Medication review may be incomplete',
      detail: 'Medication content is present, but side-effect or tolerability language is limited. Verify whether that should be documented.',
      severity: 'review',
      basedOn: ['Clinician notes', 'Objective data'],
    });
  }

  if (!sections?.intakeCollateral?.trim() && /(mother|father|family|wife|husband|girlfriend|boyfriend|collateral|nursing|social work)/i.test(sourceInput)) {
    suggestions.push({
      title: 'Collateral details may be mixed into other sections',
      detail: 'Collateral-like details appear in the source. Consider separating them into Intake / Collateral for cleaner attribution and review.',
      severity: 'info',
      basedOn: ['Intake / collateral'],
    });
  }

  if (/(mother|father|spouse|collateral|girlfriend|boyfriend|nursing|staff)/i.test(sourceInput) && /(patient says|patient reports|denies|transcript)/i.test(sourceInput)) {
    suggestions.push({
      title: 'Attribution conflict risk',
      detail: 'Patient and collateral/transcript/staff voices are both present. Keep them visibly separated so the draft does not collapse disagreement into fake certainty.',
      severity: 'review',
      basedOn: ['Clinician notes', 'Intake / collateral', 'Conversation / transcript'],
    });
  }

  if (/medication list still shows|not yet updated|mar shows|bp today\s*:|responding to internal stimuli|positive for cocaine|uds positive/i.test(sourceInput)) {
    suggestions.push({
      title: 'Subjective vs objective mismatch risk',
      detail: 'The source includes chart/objective details that may not align neatly with the narrative summary. Re-check patient report against meds, vitals, labs, MAR, and observed behavior during review.',
      severity: 'review',
      basedOn: ['Clinician notes', 'Objective data'],
    });
  }

  if (constraints.sourceIsSparse) {
    suggestions.push({
      title: constraints.sourceIsVerySparse ? 'Very sparse input: hallucination-pressure case' : 'Sparse input can inflate into richer certainty',
      detail: constraints.sourceIsVerySparse
        ? 'This source is extremely thin. Prefer near-literal restatement of the few documented facts and leave other sections minimal rather than cleaning the note into pseudo-completeness.'
        : 'This source is thin. Keep the draft visibly sparse and do not smooth it into stability, completeness, or routine follow-up language that was never documented.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Conversation / transcript', 'Objective data'],
    });
  }

  if (!constraints.sourceHasExplicitPlan || constraints.sourceOnlyHasRefillOrContinuePlan) {
    suggestions.push({
      title: 'Plan may be broader than the source',
      detail: constraints.sourceHasExplicitPlan
        ? 'The source supports only minimal plan content. Keep the Plan section limited to what is explicitly documented rather than expanding into monitoring, counseling, or routine management language.'
        : 'No explicit plan details were found in the source. Prefer a sparse Plan section that states the plan was not documented rather than inventing likely next steps.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Conversation / transcript'],
    });
  }

  if (constraints.sourceHasTherapyInterventionWithoutClearEffect) {
    suggestions.push({
      title: 'Therapy intervention documented without clear benefit',
      detail: 'The source says an intervention was attempted but not clearly helpful or benefit was uncertain. Preserve that exact lack of benefit instead of turning it into progress, coping success, or future-session planning.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Conversation / transcript'],
    });
  }

  if (constraints.sourceHasConflictSignals) {
    suggestions.push({
      title: 'Unresolved source conflict requires explicit preservation',
      detail: 'This case contains disagreement across source types. In the Assessment, keep both sides visible and use unresolved wording rather than choosing a winner or converting the conflict into a cleaner conclusion.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Intake / collateral', 'Conversation / transcript', 'Objective data'],
    });
  }

  if (constraints.sourceHasTranscriptClinicianConflict) {
    suggestions.push({
      title: 'Transcript disclosure conflicts with cleaner clinician summary',
      detail: 'A transcript-level self-harm disclosure conflicts with a cleaner clinician note. Preserve that contradiction explicitly and avoid stronger labels such as NSSI unless the source itself uses them.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Conversation / transcript'],
    });
  }

  if (constraints.sourceHasSubstanceConflict) {
    suggestions.push({
      title: 'Current denial does not settle recent substance risk',
      detail: 'Keep patient denial, collateral concern, and positive objective data visible together. Do not convert them into a settled timing or pattern of substance use.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Intake / collateral', 'Conversation / transcript', 'Objective data'],
    });
  }

  if (constraints.sourceHasPsychosisObservationConflict) {
    suggestions.push({
      title: 'Current denial does not settle observed psychosis concern',
      detail: 'Behavior may raise concern for internal preoccupation, but the source does not cleanly resolve symptom status. Keep the observations attributed and avoid turning them into either confirmed hallucinations or confirmed absence of psychotic symptoms.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Conversation / transcript', 'Objective data'],
    });
  }

  if (constraints.sourceHasMedicationConflict) {
    suggestions.push({
      title: 'Medication conflict should stay visible',
      detail: 'Medication plan, charted list, patient report, or objective med data do not line up cleanly. Keep the mismatch explicit instead of collapsing it into one confident active regimen.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Conversation / transcript', 'Objective data'],
    });
  }

  if (constraints.sourceHasMedicationAdherenceUncertainty) {
    suggestions.push({
      title: 'Avoid stronger adherence wording than the source supports',
      detail: 'The source only supports limited or mixed adherence language. Do not round this into “taking as prescribed,” “compliant,” or another stronger adherence conclusion.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Conversation / transcript', 'Objective data'],
    });
  }

  if (constraints.sourceHasMedicationSideEffectUncertainty) {
    suggestions.push({
      title: 'Medication side-effect wording may need restraint',
      detail: 'The source suggests medication side effects or tolerability issues with uncertainty, temporariness, or only partial resolution. Preserve that nuance instead of making the reaction sound definite or fully resolved.',
      severity: 'review',
      basedOn: ['Clinician notes', 'Conversation / transcript'],
    });
  }

  if (constraints.sourceHasMedicationRefillWithoutDecision) {
    suggestions.push({
      title: 'Refill request does not equal a documented medication decision',
      detail: 'The source documents a refill need/request, but not necessarily that the refill was sent or that the regimen was affirmatively continued, restarted, or adjusted today.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Objective data'],
    });
  }

  if (/(denies si|not suicidal|denies hallucinations|denies ah\/vh|no self-harm reported)/i.test(sourceInput)
    && /(yesterday|three days ago|last week|cut my|wish i wouldn't wake up|mother reports active si|positive for cocaine|responding to internal stimuli)/i.test(sourceInput)) {
    suggestions.push({
      title: 'Current denial may erase recent or conflicting risk detail',
      detail: 'This source contains present-moment denial language plus recent risk, behavior, or conflicting report. Keep both sides visible instead of letting the cleaner denial become the whole story.',
      severity: 'warning',
      basedOn: ['Clinician notes', 'Intake / collateral', 'Conversation / transcript', 'Objective data'],
    });
  }

  return suggestions;
}

export function buildFidelityDirectives(sourceInput: string, keepCloserToSource: boolean) {
  const explicitDates = extractExplicitDates(sourceInput);
  const directives = [
    'Use the source wording when it is already clinically usable; do not paraphrase just to sound smarter.',
    'If a section has only one or two supported facts, keep it brief instead of rounding it out with filler.',
    'Do not convert sparse source bullets into broad narrative interpretation.',
  ];

  if (keepCloserToSource) {
    directives.push('Closer-to-source mode is ON. Prefer literal cleanup over stylistic rewriting.');
    directives.push('When a source sentence is already usable, preserve most of its wording and order.');
  }

  if (explicitDates.length) {
    directives.push(`Preserve these explicit dates exactly as written if they appear in the note: ${explicitDates.join(', ')}.`);
  }

  return directives;
}
