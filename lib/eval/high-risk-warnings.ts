import { normalizeText } from '@/lib/ai/source-analysis';
import type { SourceSections } from '@/types/session';

export type HighRiskWarning = {
  id:
    | 'passive-death-wish'
    | 'global-negation'
    | 'attribution-conflict'
    | 'subjective-objective-mismatch'
    | 'timeline-drift-risk'
    | 'medication-reconciliation'
    | 'medication-plan-overreach'
    | 'medication-side-effect-overstatement'
    | 'sparse-input-richness'
    | 'plan-overreach'
    | 'current-denial-recent-risk'
    | 'partial-improvement-flattened'
    | 'conflict-adjudication-language';
  title: string;
  detail: string;
  reviewHint: string;
};

function sectionText(sourceSections: SourceSections | null | undefined, key: keyof SourceSections) {
  return sourceSections?.[key]?.trim() || '';
}

function extractDoseMentions(text: string) {
  const matches = text.match(/\b[a-z][a-z0-9-]*\s+\d+(?:\.\d+)?\s*(?:mg|mcg|g|units?)\s*(?:daily|bid|tid|qid|qhs|qam|qpm|q\d+h|twice daily|once daily)?\b/gi) ?? [];
  return Array.from(new Set(matches.map((item) => item.trim().toLowerCase())));
}

function extractTemporalPhrases(text: string) {
  const matches = text.match(/\b(?:today|yesterday|tonight|this week|last week|last month|this month|last visit|current|currently|now|nowadays|recently|over the last \d+ \w+|over last \d+ \w+|for the last \d+ \w+|\d+ days ago|\d+ weeks ago|\d+ months ago|one month ago|two months ago|after first week|during worst days)\b/gi) ?? [];
  return Array.from(new Set(matches.map((item) => item.toLowerCase())));
}

export function getHighRiskWarnings(input: {
  sourceInput: string;
  outputText: string;
  sourceSections?: SourceSections | null;
}): HighRiskWarning[] {
  const sourceInput = input.sourceInput || '';
  const outputText = input.outputText || '';
  const normalizedSource = normalizeText(sourceInput).toLowerCase();
  const normalizedOutput = normalizeText(outputText).toLowerCase();
  const clinicianNotes = sectionText(input.sourceSections, 'clinicianNotes').toLowerCase();
  const collateral = sectionText(input.sourceSections, 'intakeCollateral').toLowerCase();
  const transcript = sectionText(input.sourceSections, 'patientTranscript').toLowerCase();
  const objectiveData = sectionText(input.sourceSections, 'objectiveData').toLowerCase();
  const warnings: HighRiskWarning[] = [];

  const hasPassiveDeathWish = /(wish i wouldn t wake up|wish i could disappear|not wake up|passive death|passive si|wish i was dead)/.test(normalizedSource);
  const deniesActiveSuicidality = /(denies plan|denies intent|don t want to kill myself|denies wanting to kill self|denies wanting to kill myself|denies active suicidal ideation|denies si|not suicidal)/.test(normalizedSource);
  const outputFlattensToSimpleDenial = /(denies si|denies suicidal ideation|no si|not suicidal)/.test(normalizedOutput) && !/(passive|wouldn t wake up|not wake up|disappear|death wish|wish.*wake up)/.test(normalizedOutput);
  if (hasPassiveDeathWish && deniesActiveSuicidality && outputFlattensToSimpleDenial) {
    warnings.push({
      id: 'passive-death-wish',
      title: 'Passive death-wish language may have been flattened into simple SI denial',
      detail: 'Source contains passive death-wish wording plus denial of active plan/intent, but the draft appears to summarize this as a clean SI denial.',
      reviewHint: 'Verify that the note preserves passive-thought nuance without overstating active suicidality.',
    });
  }

  const sourceHasNegatedButQualifiedRisk = (/(denies (?:si|suicidal ideation|hallucinations|ah\/vh)|not suicidal|no self-harm)/.test(normalizedSource)
    && /(wish i wouldn t wake up|passive|cutting|cut my|three days ago|yesterday|mother reports active si|girlfriend reports|responding to internal stimuli|laughing to self|staring intermittently|positive for cocaine|uds positive)/.test(normalizedSource));
  const outputUsesStrongerGlobalNegation = (/(denies si|not suicidal|denies hallucinations|no psychotic symptoms|no self-harm)/.test(normalizedOutput)
    && !/(however|but|while|although|passive|cut|three days ago|yesterday|mother reports|collateral|positive screen|uds|observed|responding to internal stimuli|laughing to self)/.test(normalizedOutput));
  if (sourceHasNegatedButQualifiedRisk && outputUsesStrongerGlobalNegation) {
    warnings.push({
      id: 'global-negation',
      title: 'Global denial may be stronger than the source supports',
      detail: 'The source includes denial language plus a qualifying risk, behavior, or conflicting report, but the draft reads closer to a clean global negation.',
      reviewHint: 'Keep denial language bounded. Re-check whether recent risk, behavior, or conflicting source material still needs to remain visible.',
    });
  }

  const hasCollateralSource = /(mother|father|spouse|wife|husband|family|collateral|nursing|social work|staff)/.test(normalizedSource) || Boolean(collateral);
  const hasPatientSource = /patient[:\s]|"/.test(transcript) || /patient says|patient reports|denies/.test(normalizedSource);
  const sourceHasConflictLanguage = /(denies .*vaping|denies vaping|school is fine|no chest pain|doing fine|calmer today|better overall|no self-harm reported|denies recent cocaine use|denies ah\/vh|denies hallucinations)/.test(normalizedSource)
    && /(mother reports|spouse says|collateral|objective data|found vape|skipped|bp today|medication list still shows|responding to internal stimuli|yesterday|girlfriend reports|positive for cocaine|cut my|staff note|nursing)/.test(normalizedSource);
  const outputUsesConflictTermsWithoutAttribution = /(vape|skipp|irritable|blood pressure|voices|medication list|dose|school|cocaine|cut|outbursts|internal preoccupation)/.test(normalizedOutput)
    && !/(mother|father|spouse|collateral|per collateral|patient reports|patient states|objective data|mar|nursing note|staff|transcript)/.test(normalizedOutput);
  if (hasCollateralSource && hasPatientSource && sourceHasConflictLanguage && outputUsesConflictTermsWithoutAttribution) {
    warnings.push({
      id: 'attribution-conflict',
      title: 'Conflicting sources may be collapsing into one narrative',
      detail: 'Source includes different speakers or source types with potentially conflicting claims, but the draft does not appear to keep attribution explicit.',
      reviewHint: 'Check whether patient, collateral/transcript, staff, and objective findings remain clearly labeled instead of being blended.',
    });
  }

  const sourceHasObjectiveConflict = /(medication list still shows|bp today:\s*\d|mar shows|objective data|positive for cocaine|uds positive|responding to internal stimuli)/.test(normalizedSource)
    && /(increased|decreased|better overall|denies ah today|voices yesterday|taking .* most days|calmer today|denies recent cocaine use|denies hallucinations)/.test(normalizedSource);
  const outputUsesAdjudicationLanguage = /(supported by|confirmed by|consistent with|indicates recent use|suggests recent use|positive (?:screen|uds).*indicat|continues to exhibit)/.test(normalizedOutput);
  if (sourceHasObjectiveConflict && outputUsesAdjudicationLanguage) {
    warnings.push({
      id: 'conflict-adjudication-language',
      title: 'Conflict may be phrased as if one source settled it',
      detail: 'The source contains unresolved patient-vs-objective/chart/observation tension, but the draft uses adjudicating language that can make one side sound dispositive.',
      reviewHint: 'Replace winner-picking phrasing with explicit attribution and unresolved-conflict wording when the source bundle does not actually resolve the issue.',
    });
  }
  const outputNormalizesObjectiveConflict = (/(controlled|stable|resolved|free of panic|voices are gone|tolerating well|without current auditory or visual hallucinations)/.test(normalizedOutput)
    || (extractDoseMentions(sourceInput).length > 1 && extractDoseMentions(outputText).length === 1))
    && !/(objective|medication list|still shows|yesterday|today|however|but|conflict|mismatch|positive screen|observed|denies)/.test(normalizedOutput);
  if (sourceHasObjectiveConflict && outputNormalizesObjectiveConflict) {
    warnings.push({
      id: 'subjective-objective-mismatch',
      title: 'Subjective vs objective mismatch may have been over-smoothed',
      detail: 'The source appears to contain narrative/objective tension, but the draft reads as if one side was chosen cleanly without signaling the mismatch.',
      reviewHint: 'Re-check patient report against vitals, med lists, MAR/labs, and observed behavior before accepting the summary.',
    });
  }

  const temporalPhrases = extractTemporalPhrases(sourceInput);
  const sourceHasTimelineRisk = temporalPhrases.length >= 2 || /(yesterday|today).*(yesterday|today)|two months ago|last occurred|after first week/.test(normalizedSource);
  const outputDropsTimeline = sourceHasTimelineRisk
    && temporalPhrases.filter((phrase) => normalizedOutput.includes(phrase)).length === 0
    && !/(historical|currently|now|today|yesterday|weeks ago|months ago)/.test(normalizedOutput);
  if (sourceHasTimelineRisk && outputDropsTimeline) {
    warnings.push({
      id: 'timeline-drift-risk',
      title: 'Timeline detail may have been compressed out of the draft',
      detail: 'Source contains multiple time anchors or old-vs-current distinctions, but the draft does not appear to preserve them explicitly.',
      reviewHint: 'Check old vs current symptoms, sequence of med changes, and today-vs-yesterday wording before accepting the summary.',
    });
  }

  const sourceDoseMentions = extractDoseMentions(sourceInput);
  const outputDoseMentions = extractDoseMentions(outputText);
  const sourceHasMedicationConflict = sourceDoseMentions.length >= 2 || /(medication list still shows|not yet updated|most days|missed .* pill|dose increase|dose decrease|increased .* from .* to|pharmacy refill history was not reviewed|reports staying on)/.test(normalizedSource);
  const outputLooksOverclean = (sourceHasMedicationConflict && outputDoseMentions.length === 1 && sourceDoseMentions.length > outputDoseMentions.length)
    || (sourceHasMedicationConflict && /(tolerating well|adherent|compliant|has not increased .* as planned)/.test(normalizedOutput) && !/(missed|most days|temporary|mostly gone|not yet updated|reports staying on|medication list|chart)/.test(normalizedOutput));
  if (sourceHasMedicationConflict && outputLooksOverclean) {
    warnings.push({
      id: 'medication-reconciliation',
      title: 'Medication reconciliation may be cleaner than the source',
      detail: 'The source includes dose, adherence, intended-plan, or med-list mismatch nuance that the draft may have simplified too aggressively.',
      reviewHint: 'Verify active dose, actual reported use, and whether chart or refill history leaves the medication picture unresolved.',
    });
  }

  const sourceHasMedicationRefillOnly = /(needs refill|refill requested|requests? (?:a )?refill)/.test(normalizedSource)
    && !/(refill sent|refill provided|refill authorized|continue current regimen|continue .* today|increase|decrease|restart|stop|switch)/.test(normalizedSource);
  const outputInventsMedicationPlan = /(continue(?:d)?\s+[a-z]|refill sent|refilled|restart(?:ed)?|increase(?:d)?|decrease(?:d)?|monitor for side effects)/.test(normalizedOutput)
    && !/(needs refill|refill requested|requests? refill|plan details not documented|not documented in source)/.test(normalizedOutput);
  if (sourceHasMedicationRefillOnly && outputInventsMedicationPlan) {
    warnings.push({
      id: 'medication-plan-overreach',
      title: 'Medication plan wording may outrun the source',
      detail: 'The source appears to document only a refill request or similarly thin medication plan, but the draft reads as if a clearer med decision was made.',
      reviewHint: 'Check whether the source actually documents refill completion, continuation, dose change, restart, or monitoring language before keeping it.',
    });
  }

  const sourceHasMedicationSideEffectNuance = /(first few days|mostly gone|not sure whether .* medication-related|emotionally numb|unclear whether .* medication-related)/.test(normalizedSource);
  const outputOverstatesMedicationSideEffects = /(tolerating well|no side effects|side effects resolved|medication caused|due to the medication)/.test(normalizedOutput)
    && !/(mostly gone|unclear|not sure|first few days|temporary)/.test(normalizedOutput);
  if (sourceHasMedicationSideEffectNuance && outputOverstatesMedicationSideEffects) {
    warnings.push({
      id: 'medication-side-effect-overstatement',
      title: 'Medication side-effect wording may be stronger than the source',
      detail: 'The source frames side effects or tolerability with uncertainty, timing, or partial improvement, but the draft reads more definite or fully resolved.',
      reviewHint: 'Preserve whether the effect was temporary, partial, historical, or uncertain instead of flattening it into a settled medication conclusion.',
    });
  }

  const sourceWordCount = normalizeText(sourceInput).split(' ').filter(Boolean).length;
  const outputWordCount = normalizeText(outputText).split(' ').filter(Boolean).length;
  const sourceIsSparse = sourceWordCount > 0 && sourceWordCount <= 110;
  const outputFeelsPadded = outputWordCount >= Math.max(sourceWordCount * 1.5, 110)
    || /(euthymic|linear thought process|insight and judgment fair|well-appearing|normal exam|coping skills reviewed|stable|doing well|future sessions|monitor symptoms)/.test(normalizedOutput);
  if (sourceIsSparse && outputFeelsPadded) {
    warnings.push({
      id: 'sparse-input-richness',
      title: 'Sparse input may have been turned into richer certainty',
      detail: 'The source is thin, but the draft appears more complete, stable, or planful than the available evidence supports.',
      reviewHint: 'Prefer a sparse but faithful note over filler. Remove boilerplate findings or generic plan language that was never provided.',
    });
  }

  const sourceHasThinOrExplicitlyNarrowPlan = !/(plan:|follow up|follow-up|return in|rtc|continue current plan|continue current regimen|monitor|reviewed coping|safety plan|will call|start|stop|increase|decrease|switch|labs?|therapy weekly|precautions)/.test(normalizedSource)
    || /(plan details (?:were )?not documented|needs refill|refill requested|continue current regimen)/.test(normalizedSource);
  const outputAddsPlanContent = /(plan:)?[\s\S]{0,120}(monitor|follow up|return|continue meds|reviewed coping|safety plan|hydration|supportive care|call crisis line)/.test(normalizedOutput)
    && !/(not documented in source|plan details not documented)/.test(normalizedOutput);
  if (sourceHasThinOrExplicitlyNarrowPlan && outputAddsPlanContent) {
    warnings.push({
      id: 'plan-overreach',
      title: 'Plan may be broader than the source documents',
      detail: 'The source contains little or no explicit plan content, but the draft appears to expand it into routine monitoring, coping, refill, or follow-up language.',
      reviewHint: 'Keep the Plan section minimal unless the source actually documents a next step, medication change, or safety instruction.',
    });
  }

  const sourceHasCurrentDenialButRecentRisk = (/(denies si|not suicidal|denies hallucinations|denies ah\/vh|no self-harm reported)/.test(normalizedSource)
    && /(yesterday|three days ago|last week|recent cutting|mother reports active si|wish i wouldn t wake up|positive for cocaine|responding to internal stimuli)/.test(normalizedSource));
  const outputErasesRecentRisk = (/(denies si|not suicidal|denies hallucinations|no self-harm)/.test(normalizedOutput)
    && !/(yesterday|last week|three days ago|recent|passive|mother reports|positive screen|observed|cutting|responding to internal stimuli)/.test(normalizedOutput));
  if (sourceHasCurrentDenialButRecentRisk && outputErasesRecentRisk) {
    warnings.push({
      id: 'current-denial-recent-risk',
      title: 'Current denial may be erasing recent or conflicting risk detail',
      detail: 'The source includes present-moment denial language plus recent risk, behavior, or collateral concern, but the draft appears to keep only the cleaner denial.',
      reviewHint: 'Preserve current denial and the recent/conflicting risk material side by side when the source does not resolve them cleanly.',
    });
  }

  const sourceHasPartialImprovement = /(a little better|helped some|mostly gone|decreased|down to|calmer today|still|not all the way there|better overall|improved after first week)/.test(normalizedSource);
  const outputClaimsFullImprovement = /(doing well|resolved|stable|symptoms remitted|free of panic|voices are gone|no functional impairment|sleep normal|marked improvement)/.test(normalizedOutput)
    && !/(still|partial|some|today|yesterday|not all the way|mostly gone|decreased)/.test(normalizedOutput);
  if (sourceHasPartialImprovement && outputClaimsFullImprovement) {
    warnings.push({
      id: 'partial-improvement-flattened',
      title: 'Partial improvement may be flattened into full improvement',
      detail: 'The source describes limited or time-bounded improvement, but the draft reads closer to full resolution or global stability.',
      reviewHint: 'Preserve residual symptoms, remaining functional limits, and today-vs-yesterday distinctions.',
    });
  }

  return warnings;
}
