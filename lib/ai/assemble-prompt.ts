import { buildFidelityDirectives, summarizeSourceConstraints } from '@/lib/ai/source-analysis';

type AssemblePromptInput = {
  templatePrompt: string;
  stylePrompt: string;
  specialty: string;
  noteType: string;
  outputStyle: string;
  format: string;
  keepCloserToSource: boolean;
  flagMissingInfo: boolean;
  sourceInput: string;
  mseGuidanceLines?: string[];
  encounterSupportLines?: string[];
  medicationProfileLines?: string[];
  diagnosisProfileLines?: string[];
  customInstructions?: string;
};

export function assemblePrompt(input: AssemblePromptInput) {
  const constraints = summarizeSourceConstraints(input.sourceInput);

  const styleSettings = [
    `Specialty: ${input.specialty}`,
    `Note type: ${input.noteType}`,
    `Output style: ${input.outputStyle}`,
    `Format: ${input.format}`,
    `Keep closer to source wording: ${input.keepCloserToSource ? 'yes' : 'no'}`,
    `Flag missing info: ${input.flagMissingInfo ? 'yes' : 'no'}`,
  ].join('\n');

  const sourceShapeDirectives = [
    constraints.sourceIsVerySparse
      ? 'Very-sparse-input mode: the source contains only a few facts. Stay near-literal. Do not add summary sentences such as "status unchanged," "no new symptoms," or other completeness language unless the source itself says that.'
      : constraints.sourceIsSparse
        ? 'Sparse-input mode: the source is thin. Keep sections short, avoid filler, and do not translate thin input into a full-looking visit.'
        : null,
    !constraints.sourceHasExplicitPlan
      ? 'No explicit plan is documented in the source. In the Plan section, say only that plan details were not documented in the source, or leave the section minimal. Do not invent monitoring, supportive care, follow-up actions, refill actions, coping strategies, or safety-management steps.'
      : null,
    constraints.sourceOnlyHasRefillOrContinuePlan
      ? 'Plan content is minimal. Do not broaden a refill request, continue-current-plan statement, or simple follow-up interval into a fuller management plan.'
      : null,
    constraints.sourceHasRefillRequest
      ? 'If the source says a refill is needed or requested, document only the refill request unless the source explicitly says the refill was sent, provided, or authorized.'
      : null,
    constraints.sourceHasMinimalStatusLanguage
      ? 'Phrases like "about the same" or "nothing major changed" do not justify adding "stable," "unchanged," "no new symptoms," or a fuller symptom review. When that is the only status language, preserve the patient-shaped wording as literally as possible, especially in Symptom Review and Assessment. Either restate that exact sparse wording or say only "Not documented in source." Keep that ambiguity.'
      : null,
    constraints.sourceIsVerySparse
      ? 'For required sections with no supported content, prefer an empty/minimal section or a very short statement like "Not documented in source." Do not pad with explanatory filler such as "No new symptom details were provided" or "Assessment details were not provided in the source."'
      : null,
    constraints.sourceHasTherapyInterventionWithoutClearEffect
      ? 'An intervention was attempted without clear or certain benefit. Preserve the attempted intervention and the reported lack of help or uncertainty about benefit in the main note. Do not imply progress, symptom improvement, or future coping work unless explicitly documented.'
      : null,
    constraints.sourceHasTimelineAnchors
      ? 'The source is timeline-sensitive. Preserve old-versus-current distinctions, timing anchors, and sequence wording explicitly. Do not flatten historical symptoms into current symptoms or compress partial chronology into a single present-tense summary.'
      : null,
    constraints.sourceHasPartialImprovementLanguage
      ? 'The source describes partial or qualified improvement. Keep residual symptoms, continued limitations, and hedged wording visible. Do not translate partial improvement into resolution, stability, or global control.'
      : null,
    constraints.sourceHasExplicitNoSiOrRiskLine
      ? 'If the source explicitly says no SI, no self-harm, denial of plan/intent, or similar no-risk language, preserve that negative safety wording in the note rather than dropping it.'
      : null,
    constraints.sourceHasPassiveDeathWishNuance
      ? 'If the source mixes passive death-wish language with denial of active suicidal intent or plan, preserve both pieces together. Do not flatten this into either a clean denial of suicidality or an active-suicidality statement.'
      : null,
    constraints.sourceHasPassiveDeathWishNuance
      ? 'In Assessment and risk wording, do not let present-moment denial language erase chronic passive death wish, recent concerning behavior, or unresolved safety nuance that remains documented in the source.'
      : null,
    constraints.sourceHasViolenceRiskNuance
      ? 'If the source includes violent thoughts or fantasies but explicitly denies intent, plan, weapon access, or steps toward violence, preserve that distinction. Do not erase the violent-thought content, and do not inflate it into an active violent plan or direct threat.'
      : null,
    constraints.sourceHasSafetySupportLanguage
      ? 'If the source names a support or crisis resource, you may preserve that exact documented support language, but do not expand it into a broader safety-monitoring plan.'
      : null,
    constraints.sourceHasConflictSignals
      ? 'The source contains unresolved conflict or contradiction across speakers or source types. In every section, especially Assessment, preserve both sides of the conflict explicitly instead of adjudicating it.'
      : null,
    constraints.sourceHasConflictSignals
      ? 'When conflict is unresolved, prefer constructions such as "Patient denies X; collateral/objective/transcript source raises concern for Y" or "Source conflict remains unresolved in the provided material." Do not rewrite conflict into a settled conclusion.'
      : null,
    constraints.sourceHasConflictSignals
      ? 'Do not use conflict-softening rhetoric that quietly picks a winner, including phrases like "supported by," "confirmed by," "consistent with," "indicates," "suggests recent use," "continues to exhibit," or equivalent wording when the underlying source remains disputed. Keep each conflicting fact attributed to its source.'
      : null,
    constraints.sourceHasTranscriptClinicianConflict
      ? 'If a transcript discloses recent self-harm while a clinician summary says no self-harm was reported, say the sources conflict and preserve the recent disclosure. Do not state that no self-harm was reported, and do not upgrade the behavior into NSSI or suicide-attempt language unless the source explicitly does so.'
      : null,
    constraints.sourceHasSubstanceConflict
      ? 'If the patient denies substance use but collateral or objective data raise concern, keep the denial and the conflicting evidence side by side. Do not conclude a precise timing, amount, or pattern of use unless the source directly establishes it. Avoid assessment wording like "objective data indicate recent use," "supported by a positive screen," "confirmed by the urine drug screen," or other phrasing that rhetorically lets the objective source settle the case. Instead say the positive screen exists, the denial exists, collateral concern exists, and the conflict remains unresolved in the provided source.'
      : null,
    constraints.sourceHasPsychosisObservationConflict
      ? 'If hallucinations are denied but behavior/observations raise concern for internal preoccupation, keep the observations attributed to clinician/nursing and preserve the uncertainty about what they mean. Do not convert this into either confirmed hallucinations or confirmed absence of psychotic symptoms.'
      : null,
    constraints.sourceHasMedicationConflict
      ? 'If medication source material conflicts across patient report, clinician plan, chart med list, MAR, or refill history, keep the conflict explicit. Do not collapse it into one settled active regimen unless the source itself resolves it. Name which source says what when needed (for example prior plan/chart med list says one thing while the patient reports another) instead of silently reconciling them, and note when the current documentation does not resolve the actual regimen today.'
      : null,
    constraints.sourceHasMedicationAdherenceUncertainty
      ? 'Do not strengthen medication adherence wording. Phrases like “most days,” missed doses, self-discontinuation, or patient-reported deviation from the listed regimen must remain limited and explicit rather than becoming “adherent,” “compliant,” or “taking as prescribed.”'
      : null,
    constraints.sourceHasMedicationSideEffectUncertainty
      ? 'Do not overstate medication side effects or tolerability. Preserve temporary, partial, historical, or uncertain wording rather than turning it into a definite current adverse effect or full resolution.'
      : null,
    constraints.sourceHasMedicationRefillWithoutDecision
      ? 'A refill request alone does not prove the refill was sent or that a medication was continued, restarted, increased, decreased, or otherwise decided today. Document only the refill request unless the source says more.'
      : null,
    constraints.sourceHasObjectiveNarrativeMismatch
      ? 'When objective/chart/staff data and narrative self-report do not line up neatly, keep both sides visible and attributed. Do not let cleaner narrative prose erase materially abnormal vitals, positive screens, MAR/chart mismatches, or observed behavior.'
      : null,
    constraints.sourceHasObjectiveNarrativeMismatch
      ? 'In Assessment, state the unresolved objective-versus-narrative tension plainly when it matters clinically. Do not rewrite abnormal vitals, positive toxicology, MAR/chart mismatch, or observed behavior into a cleaner settled conclusion.'
      : null,
    constraints.sourceHasObjectiveNarrativeMismatch
      ? 'In Plan, do not imply that an objective conflict was resolved unless the source explicitly documents the resolution or decision. If objective findings matter but no action is documented, keep the plan minimal and source-literal.'
      : null,
    constraints.sourceHasMedicationConflict
      ? 'If medication conflict is present, Plan must not silently choose a final regimen unless the source actually resolves it. It is acceptable for the note to say that the current documentation does not fully resolve the active regimen today.'
      : null,
    input.medicationProfileLines?.length
      ? 'Use the provider-structured psychiatric medication profile as a conservative regimen guardrail. If dose, schedule, route, or the normalized medication name remains incomplete or uncertain in that profile, keep the regimen wording incomplete or uncertain in the draft rather than guessing the missing detail.'
      : null,
    input.medicationProfileLines?.length
      ? 'If the medication profile and the source packet do not fully reconcile, keep that mismatch visible in Assessment or medication wording. Do not silently convert provider-entered support data into a settled final regimen.'
      : null,
    input.diagnosisProfileLines?.length
      ? 'Use the provider-structured diagnosis / assessment profile as an uncertainty guardrail. If an entry is marked historical, rule-out, differential, or symptom-level, do not upgrade it into a current confirmed diagnosis unless the source itself clearly does so.'
      : null,
    input.diagnosisProfileLines?.length
      ? 'If the diagnosis profile marks certainty as unclear, possible, or otherwise hedged, preserve that hedging in Assessment. Do not translate it into a firmer diagnostic conclusion just because the prose sounds cleaner.'
      : null,
    input.diagnosisProfileLines?.length
      ? 'If diagnosis profile evidence or timeframe notes are sparse, keep Assessment conservative. It is acceptable to leave the differential open or describe symptom-level formulation instead of forcing a closed diagnosis.'
      : null,
  ].filter(Boolean) as string[];

  const fidelityDirectives = [...sourceShapeDirectives, ...buildFidelityDirectives(input.sourceInput, input.keepCloserToSource)]
    .map((item) => `- ${item}`)
    .join('\n');

  const reviewabilityDirectives = [
    'Reviewability requirements:',
    '- Every sentence in the note must be supportable from the source input.',
    '- If support is weak, ambiguous, or absent, omit the claim or surface it as a flag rather than guessing.',
    '- Do not turn likely possibilities into findings, denials, assessments, or plans.',
    '- Preserve quoted or source-shaped wording when it reduces interpretation risk.',
    '- Prefer a sparse but faithful draft over a fuller note that overstates certainty.',
    '- For very sparse input, restate only the few documented facts and leave the rest minimal instead of adding summary cleanup.',
    '- When explicit negative safety language is present (for example no SI / denies plan / no self-harm), keep it visible rather than omitting it for brevity.',
    '- If sources conflict, the Assessment must name the conflict rather than resolve it. Do not let assessment-level wording quietly choose which source is true.',
    '- Avoid rhetorical adjudication words such as "supported by," "confirmed by," "consistent with," or "indicates" when the whole point of the source bundle is that the conflict remains unresolved.',
    '- Do not convert conflict-shaped source into stronger behavioral or diagnostic labels than the source itself uses.',
    '- When behavioral observations conflict with patient denial, keep the wording observational and attributed.',
    '- Preserve timeline anchors like today, yesterday, last week, two months ago, after first week, and over the last 2 weeks when they matter clinically.',
    '- Do not convert historical symptoms into current symptoms, and do not compress partial improvement into global stability or resolution.',
    '- If passive death-wish language is present alongside denial of active plan/intent, keep both. Do not flatten the note into a clean SI denial.',
    '- If violent thoughts/fantasies are documented with explicit denial of intent/plan, keep the distinction between intrusive thoughts and active intent.',
    '- Do not invent medication names, doses, routes, formulations, frequencies, or timing that are not in the source.',
    '- Do not turn a refill request, med-list entry, or intended prior plan into a new medication decision for today unless the source explicitly says that decision was made.',
    '- If medication sources disagree, keep the disagreement visible in the draft and especially in the Assessment instead of silently reconciling it.',
    '- In medication-conflict cases, Assessment should be able to say both sides plainly and with attribution when supported, for example: a prior plan or chart list says one dose, the patient reports still taking another dose, and the current source does not resolve which regimen is actually current today.',
    '- If the structured medication profile itself is incomplete, do not use cleaner prose to fill the missing dose, schedule, route, or exact active regimen. Keep the gap explicit.',
    '- Do not let subjective narrative summary erase conflicting objective details such as abnormal vitals, positive screens, staff observations, MAR entries, or outdated chart medication lists.',
    '- In objective-conflict cases, Assessment should be able to name both the narrative claim and the conflicting measured or observed finding without rhetorically resolving them.',
    '- In objective-conflict cases, Plan should not sound more decisive than the documented source. If the source does not document an action tied to the abnormal or conflicting objective finding, keep the plan minimal rather than inventing follow-up logic.',
    '- Do not promote historical, rule-out, differential, or symptom-level formulations into current confirmed diagnoses unless the source explicitly supports that promotion.',
    '- Keep diagnostic certainty aligned with the source and any structured diagnosis framing. If the evidence is mixed, recent, or incomplete, the Assessment should stay mixed, recent, or incomplete.',
    '- Avoid remission, stability, or resolved-risk wording unless the source explicitly supports that level of certainty.',
  ].join('\n');

  return [
    input.templatePrompt,
    '',
    input.stylePrompt,
    '',
    styleSettings,
    '',
    reviewabilityDirectives,
    '',
    input.customInstructions?.trim() ? ['Provider-specific saved preferences:', input.customInstructions.trim()].join('\n') : '',
    input.customInstructions?.trim() ? '' : '',
    input.mseGuidanceLines?.length ? ['Psych MSE requirements:', ...input.mseGuidanceLines].join('\n') : '',
    input.mseGuidanceLines?.length ? '' : '',
    input.encounterSupportLines?.length ? ['Encounter / coding support context:', ...input.encounterSupportLines].join('\n') : '',
    input.encounterSupportLines?.length ? '' : '',
    input.medicationProfileLines?.length ? ['Provider-structured psychiatric medication profile:', ...input.medicationProfileLines].join('\n') : '',
    input.medicationProfileLines?.length ? '' : '',
    input.diagnosisProfileLines?.length ? ['Provider-structured psychiatric diagnosis / assessment profile:', ...input.diagnosisProfileLines].join('\n') : '',
    input.diagnosisProfileLines?.length ? '' : '',
    'Additional fidelity directives:',
    fidelityDirectives,
  ].filter(Boolean).join('\n');
}
