import { buildFidelityDirectives, summarizeSourceConstraints } from '@/lib/ai/source-analysis';
import { sanitizePHI } from '@/lib/security/phi-sanitizer';
import { buildEmergingDrugPromptGuidance } from '@/lib/veranote/assistant-emerging-drug-intelligence';
import type { ContradictionAnalysis } from '@/lib/veranote/assistant-contradiction-detector';
import type { AuditRiskFlag, CptSupportAssessment, LevelOfCareAssessment, LosAssessment, MedicalNecessityAssessment } from '@/lib/veranote/defensibility/defensibility-types';
import type { MseAnalysis } from '@/lib/veranote/assistant-mse-parser';
import type { RiskAnalysis } from '@/lib/veranote/assistant-risk-detector';
import type { ProviderMemoryItem } from '@/lib/veranote/memory/memory-types';
import type { KnowledgeBundle } from '@/lib/veranote/knowledge/types';
import type { DischargeStatus, LongitudinalContextSummary, NextAction, TriageSuggestion, WorkflowTask } from '@/lib/veranote/workflow/workflow-types';

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
  const sanitizedSourceInput = sanitizePHI(input.sourceInput).sanitizedText;
  const constraints = summarizeSourceConstraints(sanitizedSourceInput);
  const sourceHasVeranoteInputLanes =
    /\bPre-Visit Data\s*:/i.test(sanitizedSourceInput)
    || /\bLive Visit Notes\s*:/i.test(sanitizedSourceInput)
    || /\bAmbient Transcript\s*:/i.test(sanitizedSourceInput)
    || /\bProvider Add-On\s*:/i.test(sanitizedSourceInput);

  const styleSettings = [
    `Specialty: ${input.specialty}`,
    `Note type: ${input.noteType}`,
    `Output style: ${input.outputStyle}`,
    `Format: ${input.format}`,
    `Keep closer to source wording: ${input.keepCloserToSource ? 'yes' : 'no'}`,
    `Flag missing info: ${input.flagMissingInfo ? 'yes' : 'no'}`,
  ].join('\n');

  const sourceShapeDirectives = [
    sourceHasVeranoteInputLanes
      ? 'The source packet is divided into Veranote input lanes. Treat Pre-Visit Data, Live Visit Notes, Ambient Transcript, and Provider Add-On as separate source types; preserve attribution when they disagree instead of blending them into one settled narrative.'
      : null,
    sourceHasVeranoteInputLanes
      ? 'Provider Add-On may contain provider instructions, billing/code preferences, plan preferences, or site-specific formatting needs. Use it to guide drafting when appropriate, but do not treat it as patient-reported history, objective data, or completed clinical action unless the source explicitly says so.'
      : null,
    sourceHasVeranoteInputLanes
      ? 'Do not quote, label, or summarize Provider Add-On instructions inside the clinical note. If a Provider Add-On says "do not..." or names a formatting/billing preference, obey that instruction silently or surface it as a separate review flag only when needed.'
      : null,
    constraints.sourceIsVerySparse
      ? 'Very-sparse-input mode: the source contains only a few facts. Stay near-literal. Do not add summary sentences such as "status unchanged," "no new symptoms," or other completeness language unless the source itself says that.'
      : constraints.sourceIsSparse
        ? 'Sparse-input mode: the source is thin. Keep sections short, avoid filler, and do not translate thin input into a full-looking visit.'
        : null,
    constraints.sourceIsSparse
      ? 'When a template contains many sections, keep only the sections that carry grounded clinical value for this source. Do not pad the draft by rendering a long run of empty history domains or repeated "Not documented in source" lines just to satisfy a template silhouette.'
      : null,
    !constraints.sourceHasExplicitPlan
      ? 'No explicit plan is documented in the source. In the Plan section, say only that plan details were not documented in the source, or leave the section minimal. Do not invent monitoring, supportive care, follow-up actions, refill actions, coping strategies, or safety-management steps.'
      : null,
    constraints.sourceHasExplicitPlan
      ? 'If the source documents plan-shaped actions such as safety planning, reviewed crisis resources, support-person involvement, med adjustments, monitoring, or follow-up timing, carry those details into the Plan section instead of leaving Plan generic.'
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
    constraints.sourceIsSparse
      ? 'If a brief documentation-gaps line would make the draft more useful, use one short gap statement in Assessment or Plan rather than repeating the same missing-information sentence across multiple sections.'
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

  const fidelityDirectives = [...sourceShapeDirectives, ...buildFidelityDirectives(sanitizedSourceInput, input.keepCloserToSource)]
    .map((item) => `- ${item}`)
    .join('\n');
  const emergingDrugDirectives = buildEmergingDrugPromptGuidance(sanitizedSourceInput)
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
    emergingDrugDirectives ? 'Emerging drug / NPS guardrails:' : '',
    emergingDrugDirectives || '',
    emergingDrugDirectives ? '' : '',
    'Additional fidelity directives:',
    fidelityDirectives,
  ].filter(Boolean).join('\n');
}

type AssistantKnowledgePromptInput = {
  task: string;
  sourceNote?: string;
  knowledgeBundle: KnowledgeBundle;
  providerMemory?: ProviderMemoryItem[];
  medicalNecessity?: MedicalNecessityAssessment;
  levelOfCare?: LevelOfCareAssessment;
  cptSupport?: CptSupportAssessment;
  losAssessment?: LosAssessment;
  auditFlags?: AuditRiskFlag[];
  nextActions?: NextAction[];
  triageSuggestion?: TriageSuggestion;
  dischargeStatus?: DischargeStatus;
  workflowTasks?: WorkflowTask[];
  longitudinalSummary?: LongitudinalContextSummary;
  mseAnalysis?: MseAnalysis;
  riskAnalysis?: RiskAnalysis;
  contradictionAnalysis?: ContradictionAnalysis;
};

function compactLines(lines: string[], limit = 5) {
  return lines.filter(Boolean).slice(0, limit);
}

function truncateBlock(value: string, maxLength = 2200) {
  const normalized = value.replace(/\s+\n/g, '\n').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function formatInternalKnowledgeSection(bundle: KnowledgeBundle) {
  const lines: string[] = [];

  bundle.diagnosisConcepts.slice(0, 3).forEach((concept) => {
    lines.push(`- Diagnosis concept: ${concept.displayName}`);
    compactLines(concept.hallmarkFeatures, 2).forEach((item) => lines.push(`  - Hallmark feature: ${item}`));
    compactLines(concept.ruleOutCautions, 2).forEach((item) => lines.push(`  - Rule-out caution: ${item}`));
    compactLines(concept.documentationCautions, 2).forEach((item) => lines.push(`  - Documentation caution: ${item}`));
  });

  bundle.medicationConcepts.slice(0, 2).forEach((concept) => {
    lines.push(`- Medication concept: ${concept.displayName}`);
    compactLines(concept.documentationCautions, 2).forEach((item) => lines.push(`  - Documentation caution: ${item}`));
    compactLines(concept.highRiskFlags, 2).forEach((item) => lines.push(`  - High-risk flag: ${item}`));
  });

  bundle.emergingDrugConcepts.slice(0, 2).forEach((concept) => {
    lines.push(`- Emerging drug concept: ${concept.displayName}`);
    compactLines(concept.intoxicationSignals, 2).forEach((item) => lines.push(`  - Intoxication signal: ${item}`));
    compactLines(concept.withdrawalSignals, 2).forEach((item) => lines.push(`  - Withdrawal signal: ${item}`));
    compactLines(concept.testingLimitations, 2).forEach((item) => lines.push(`  - Testing limitation: ${item}`));
    compactLines(concept.documentationCautions, 2).forEach((item) => lines.push(`  - Documentation caution: ${item}`));
  });

  bundle.workflowGuidance.slice(0, 2).forEach((item) => {
    lines.push(`- Workflow guidance: ${item.label}`);
    compactLines(item.guidance, 2).forEach((entry) => lines.push(`  - Guidance: ${entry}`));
    compactLines(item.cautions, 2).forEach((entry) => lines.push(`  - Caution: ${entry}`));
  });

  bundle.codingEntries.slice(0, 2).forEach((entry) => {
    lines.push(`- Coding entry: ${entry.label}`);
    lines.push(`  - ICD-10 family: ${entry.likelyIcd10Family}`);
    lines.push(`  - Specificity issue: ${entry.specificityIssues}`);
    lines.push(`  - Uncertainty issue: ${entry.uncertaintyIssues}`);
  });

  return lines;
}

function formatTrustedReferenceSection(bundle: KnowledgeBundle) {
  return bundle.trustedReferences.slice(0, 4).map((reference) => {
    const typeLabel = reference.categories.length ? reference.categories.join(', ') : 'reference';
    return `- ${reference.label} (${typeLabel}) — ${reference.domain} — ${reference.url}`;
  });
}

function formatMseAnalysisSection(analysis?: MseAnalysis) {
  if (!analysis) {
    return [];
  }

  const lines: string[] = [];
  analysis.detectedDomains.slice(0, 6).forEach((domain) => {
    lines.push(`- Detected ${domain.domain}: ${domain.matches.join(', ')}`);
  });
  if (analysis.missingDomains.length) {
    lines.push(`- Missing domains: ${analysis.missingDomains.join(', ')}`);
  }
  analysis.unsupportedNormals.slice(0, 4).forEach((warning) => lines.push(`- Unsupported normal warning: ${warning}`));
  analysis.ambiguousSections.slice(0, 4).forEach((warning) => lines.push(`- Ambiguity: ${warning}`));
  return lines;
}

function formatRiskAnalysisSection(analysis?: RiskAnalysis) {
  if (!analysis) {
    return [];
  }

  const lines: string[] = [];
  const appendSignals = (label: string, signals: RiskAnalysis['suicide']) => {
    if (!signals.length) {
      lines.push(`- ${label}: insufficient data`);
      return;
    }
    signals.slice(0, 4).forEach((signal) => {
      lines.push(`- ${label}: ${signal.subtype} (${signal.confidenceLevel}) via ${signal.matchedKeywords.join(', ')}`);
      lines.push(`  - Caution: ${signal.documentationCaution}`);
    });
  };

  appendSignals('Suicide', analysis.suicide);
  appendSignals('Violence', analysis.violence);
  appendSignals('Grave disability', analysis.graveDisability);
  analysis.generalWarnings.forEach((warning) => lines.push(`- Warning: ${warning}`));
  return lines;
}

function formatContradictionSection(analysis?: ContradictionAnalysis) {
  if (!analysis || !analysis.contradictions.length) {
    return [];
  }

  return analysis.contradictions.slice(0, 4).map((item) => `- ${item.label} (${item.severity}): ${item.detail}`);
}

function formatProviderMemorySection(memoryItems?: ProviderMemoryItem[]) {
  if (!memoryItems?.length) {
    return [];
  }

  return memoryItems.slice(0, 5).map((item) => {
    const tags = item.tags.length ? ` [tags: ${item.tags.join(', ')}]` : '';
    return `- ${item.category}: ${item.content}${tags}`;
  });
}

function formatMedicalNecessitySection(assessment?: MedicalNecessityAssessment) {
  if (!assessment) {
    return [];
  }

  const lines: string[] = [];
  assessment.signals.forEach((signal) => {
    lines.push(`- ${signal.category}: ${signal.strength}`);
    signal.evidence.slice(0, 2).forEach((item) => lines.push(`  - Evidence: ${item}`));
  });
  assessment.missingElements.slice(0, 4).forEach((item) => lines.push(`- Missing element: ${item}`));
  return lines;
}

function formatLevelOfCareSection(assessment?: LevelOfCareAssessment) {
  if (!assessment) {
    return [];
  }

  return [
    `- Suggested level: ${assessment.suggestedLevel}`,
    ...assessment.justification.slice(0, 4).map((item) => `  - Justification: ${item}`),
    ...assessment.missingJustification.slice(0, 4).map((item) => `  - Missing justification: ${item}`),
  ];
}

function formatLosSection(assessment?: LosAssessment) {
  if (!assessment) {
    return [];
  }

  return [
    ...assessment.reasonsForContinuedStay.slice(0, 4).map((item) => `- Continued stay: ${item}`),
    ...assessment.barriersToDischarge.slice(0, 4).map((item) => `- Discharge barrier: ${item}`),
    ...assessment.stabilityIndicators.slice(0, 4).map((item) => `- Stability indicator: ${item}`),
    ...assessment.missingDischargeCriteria.slice(0, 4).map((item) => `- Missing discharge criterion: ${item}`),
  ];
}

function formatAuditFlagsSection(flags?: AuditRiskFlag[]) {
  if (!flags?.length) {
    return [];
  }

  return flags.slice(0, 5).map((flag) => `- ${flag.type} (${flag.severity}): ${flag.message}`);
}

function formatCptSupportSection(assessment?: CptSupportAssessment) {
  if (!assessment) {
    return [];
  }

  return [
    `- Summary: ${assessment.summary}`,
    ...assessment.documentationElements.slice(0, 3).map((item) => `  - Documentation element: ${item}`),
    ...assessment.timeHints.slice(0, 2).map((item) => `  - Time hint: ${item}`),
    ...assessment.riskComplexityIndicators.slice(0, 2).map((item) => `  - Complexity indicator: ${item}`),
    ...assessment.cautions.slice(0, 3).map((item) => `  - Caution: ${item}`),
  ];
}

function formatNextActionsSection(actions?: NextAction[]) {
  if (!actions?.length) {
    return [];
  }

  return actions.slice(0, 5).flatMap((action) => ([
    `- ${action.suggestion}`,
    `  - Rationale: ${action.rationale}`,
    `  - Confidence: ${action.confidence}`,
  ]));
}

function formatTriageSection(suggestion?: TriageSuggestion) {
  if (!suggestion) {
    return [];
  }

  return [
    `- Suggested level: ${suggestion.level}`,
    ...compactLines(suggestion.reasoning, 3).map((item) => `  - Reasoning: ${item}`),
    `  - Confidence: ${suggestion.confidence}`,
  ];
}

function formatDischargeSection(status?: DischargeStatus) {
  if (!status) {
    return [];
  }

  return [
    `- Readiness: ${status.readiness}`,
    ...compactLines(status.supportingFactors, 3).map((item) => `  - Supporting factor: ${item}`),
    ...compactLines(status.barriers, 3).map((item) => `  - Barrier: ${item}`),
  ];
}

function formatWorkflowTasksSection(tasks?: WorkflowTask[]) {
  if (!tasks?.length) {
    return [];
  }

  return tasks.slice(0, 5).flatMap((task) => ([
    `- ${task.task}`,
    `  - Reason: ${task.reason}`,
    `  - Priority: ${task.priority}`,
  ]));
}

function formatLongitudinalSection(summary?: LongitudinalContextSummary) {
  if (!summary) {
    return [];
  }

  return [
    ...compactLines(summary.symptomTrends, 2).map((item) => `- Symptom trend: ${item}`),
    ...compactLines(summary.riskTrends, 2).map((item) => `- Risk trend: ${item}`),
    ...compactLines(summary.responseToTreatment, 2).map((item) => `- Treatment trend: ${item}`),
    ...compactLines(summary.recurringIssues, 2).map((item) => `- Recurring issue: ${item}`),
  ];
}

export function assembleAssistantKnowledgePrompt(input: AssistantKnowledgePromptInput) {
  const sanitizedTask = sanitizePHI(input.task).sanitizedText;
  const sanitizedSourceNote = sanitizePHI(input.sourceNote || '').sanitizedText;
  const internalKnowledge = formatInternalKnowledgeSection(input.knowledgeBundle);
  const providerMemory = formatProviderMemorySection(input.providerMemory);
  const medicalNecessity = formatMedicalNecessitySection(input.medicalNecessity);
  const levelOfCare = formatLevelOfCareSection(input.levelOfCare);
  const nextSteps = formatNextActionsSection(input.nextActions);
  const triage = formatTriageSection(input.triageSuggestion);
  const discharge = formatDischargeSection(input.dischargeStatus);
  const workflowTasks = formatWorkflowTasksSection(input.workflowTasks);
  const cptSupport = formatCptSupportSection(input.cptSupport);
  const los = formatLosSection(input.losAssessment);
  const longitudinal = formatLongitudinalSection(input.longitudinalSummary);
  const auditFlags = formatAuditFlagsSection(input.auditFlags);
  const trustedReferences = formatTrustedReferenceSection(input.knowledgeBundle);
  const mseAnalysis = formatMseAnalysisSection(input.mseAnalysis);
  const riskAnalysis = formatRiskAnalysisSection(input.riskAnalysis);
  const contradictions = formatContradictionSection(input.contradictionAnalysis);

  return [
    '[SOURCE NOTE]',
    sanitizedSourceNote.trim() ? truncateBlock(sanitizedSourceNote) : 'No source note provided.',
    '',
    '[TASK]',
    sanitizedTask.trim() || 'No task provided.',
    '',
    '[VERA PERSONA]',
    '- Be calm, concise, professional, and psych-first.',
    '- Be warm but not chatty. Be direct but not harsh.',
    '- Stay source-first. Do not overstate, smooth away contradictions, or fabricate missing normals.',
    '- Use consistent pushback when needed: "I would not document it that way from this source.", "That wording is too certain for the available data.", or "Low-risk wording is not supported here."',
    '- Do not sound like a generic chatbot, social companion, or autonomous clinician.',
    '',
    '[RESPONSE SHAPE]',
    '- Direct reference questions: answer first, then only the minimal caveat needed.',
    '- Chart-ready wording requests: give the chart-ready wording first, then a brief why-safer line, then a brief what-not-to-say line only if useful.',
    '- Contradiction or risk prompts: warning first, then source-faithful interpretation, then chart-ready wording, then one suggested next step.',
    '- Pressure prompts: refuse the unsafe shortcut first, then give a safer alternative, then a brief explanation.',
    '- Vague follow-ups: carry forward the prior answer mode when safe; only ask a clarifying question when safety or source fidelity would otherwise be lost.',
    '',
    internalKnowledge.length ? '[INTERNAL PSYCHIATRY KNOWLEDGE]' : '',
    internalKnowledge.join('\n'),
    internalKnowledge.length ? '' : '',
    providerMemory.length ? '[PROVIDER PREFERENCES]' : '',
    providerMemory.length ? 'Provider style preferences (NOT clinical facts)' : '',
    providerMemory.join('\n'),
    providerMemory.length ? '' : '',
    medicalNecessity.length ? '[MEDICAL NECESSITY]' : '',
    medicalNecessity.join('\n'),
    medicalNecessity.length ? '' : '',
    levelOfCare.length ? '[LEVEL OF CARE]' : '',
    levelOfCare.join('\n'),
    levelOfCare.length ? '' : '',
    nextSteps.length ? '[NEXT STEPS]' : '',
    nextSteps.join('\n'),
    nextSteps.length ? '' : '',
    triage.length ? '[TRIAGE CONSIDERATION]' : '',
    triage.join('\n'),
    triage.length ? '' : '',
    discharge.length ? '[DISCHARGE STATUS]' : '',
    discharge.join('\n'),
    discharge.length ? '' : '',
    workflowTasks.length ? '[WORKFLOW TASKS]' : '',
    workflowTasks.join('\n'),
    workflowTasks.length ? '' : '',
    cptSupport.length ? '[BILLING / CPT SUPPORT]' : '',
    cptSupport.join('\n'),
    cptSupport.length ? '' : '',
    los.length ? '[LOS CONSIDERATIONS]' : '',
    los.join('\n'),
    los.length ? '' : '',
    longitudinal.length ? '[LONGITUDINAL CONTEXT]' : '',
    longitudinal.join('\n'),
    longitudinal.length ? '' : '',
    auditFlags.length ? '[AUDIT FLAGS]' : '',
    auditFlags.join('\n'),
    auditFlags.length ? '' : '',
    mseAnalysis.length ? '[MSE ANALYSIS]' : '',
    mseAnalysis.join('\n'),
    mseAnalysis.length ? '' : '',
    riskAnalysis.length ? '[RISK SIGNALS]' : '',
    riskAnalysis.join('\n'),
    riskAnalysis.length ? '' : '',
    contradictions.length ? '[CONTRADICTIONS]' : '',
    contradictions.join('\n'),
    contradictions.length ? '' : '',
    trustedReferences.length ? '[TRUSTED REFERENCES]' : '',
    trustedReferences.join('\n'),
    trustedReferences.length ? '' : '',
    '[GUARDRAILS]',
    '- Source note content is highest priority.',
    '- Internal psychiatry knowledge is supportive, not authoritative.',
    '- Diagnosis must be framed as proposed based on available information.',
    '- Do not invent symptoms, timelines, medication effects, or normal MSE findings.',
    '- Preserve uncertainty and separate observed facts from inference.',
    '- Do not collapse references into unsupported factual statements.',
    '- Avoid meta assistant commentary such as explaining that you should not answer a question. Give the safe, source-faithful response directly.',
    '[FIDELITY RULES]',
    '- Do not auto-complete missing MSE domains.',
    '- Do not resolve contradictions silently.',
    '- If risk is unclear, state insufficient data.',
    '- Distinguish observed, reported, and inferred material.',
    '- Treat workflow suggestions as supportive only and phrase them conservatively.',
  ].filter(Boolean).join('\n');
}
