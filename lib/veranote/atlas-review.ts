import type { CopilotSuggestion } from '@/types/session';
import type { EmittedMedicationWarning } from '@/types/medication-warning';

export const ATLAS_REVIEW_DOCK_ENABLED = true;

export type AtlasReviewSeverity = 'info' | 'review' | 'caution' | 'urgent';
export type AtlasReviewGroup = 'Medication/Lab' | 'Documentation' | 'Risk' | 'Workflow';
export type AtlasReviewTriggerId =
  | 'risk_contradiction'
  | 'unsupported_reassurance'
  | 'missing_mse'
  | 'source_conflict'
  | 'lithium_renal_safety'
  | 'urgent_med_lab'
  | 'qtc_safety'
  | 'clozapine_anc'
  | 'benzo_alcohol_withdrawal'
  | 'lai_product_specific';

export type AtlasReviewAction = 'ask_atlas' | 'dismiss' | 'mark_reviewed' | 'show_source';

export type AtlasReviewItem = {
  id: string;
  triggerId: AtlasReviewTriggerId;
  severity: AtlasReviewSeverity;
  group: AtlasReviewGroup;
  summary: string;
  whyThisMatters: string;
  whatToCheck: string[];
  sourceReference?: {
    label: string;
    targetId?: string;
  };
  allowedActions: AtlasReviewAction[];
  suppressUntilSourceChange: boolean;
  showNudge?: boolean;
  requiresAcknowledgement?: boolean;
};

type AtlasReviewBuildInput = {
  contradictionFlags: string[];
  copilotSuggestions: CopilotSuggestion[];
  draftMseTermsNeedingReview: Array<{ entry: { label?: string; term?: string; domain?: string } }>;
  encounterDocumentationChecks: Array<{ label: string; detail: string }>;
  highRiskWarnings: Array<{ id: string; title: string; detail: string; reviewHint?: string }>;
  medicationScaffoldWarnings: EmittedMedicationWarning[];
  objectiveConflictBullets: string[];
  phaseTwoTrustCues: Array<{ id: string; label: string; detail: string }>;
  reviewCounts: { needsReview: number; unreviewed: number };
  destinationConstraintActive: boolean;
};

function includesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function toId(prefix: string, value: string) {
  return `${prefix}-${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
}

function medSeverityToAtlasSeverity(warning: EmittedMedicationWarning): AtlasReviewSeverity {
  if (warning.severity === 'hard_stop') {
    return 'urgent';
  }

  if (
    warning.severity === 'major'
    && includesAny(`${warning.code} ${warning.title} ${warning.summary} ${warning.whyTriggered.join(' ')}`, [
      /\btoxicity\b/i,
      /\boverdose\b/i,
      /\bwithdrawal\b/i,
      /\bseizure\b/i,
      /\bsyncope\b/i,
      /\bpalpitation\b/i,
      /\bqtc\b/i,
      /\banc\b/i,
      /\binfection\b/i,
    ])
  ) {
    return 'urgent';
  }

  if (warning.severity === 'major' || warning.severity === 'moderate') {
    return 'caution';
  }

  return 'review';
}

function firstWhatToCheck(...values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim())).slice(0, 3);
}

export function buildAtlasReviewItems(input: AtlasReviewBuildInput) {
  const items: AtlasReviewItem[] = [];
  const contradictionText = input.contradictionFlags.join(' ');
  const topRiskWarning = input.highRiskWarnings[0];

  if (
    input.contradictionFlags.length
    && includesAny(contradictionText, [/\bsuic/i, /\bhomic/i, /\bviolence\b/i, /\bthreat/i, /\bsafety\b/i])
  ) {
    const urgentRisk = includesAny(contradictionText, [/\battempt\b/i, /\bweapon\b/i, /\bimminent\b/i, /\brecent\b/i]);
    items.push({
      id: 'atlas-risk-contradiction',
      triggerId: 'risk_contradiction',
      severity: urgentRisk ? 'urgent' : 'caution',
      group: 'Risk',
      summary: urgentRisk
        ? 'Risk wording may conflict with higher-acuity source facts.'
        : 'Risk wording needs a closer contradiction check.',
      whyThisMatters: 'Atlas should not let reassuring risk language outrun contradictory patient, collateral, or chart evidence.',
      whatToCheck: firstWhatToCheck(
        input.contradictionFlags[0],
        'Keep denial and conflicting evidence side by side instead of resolving the contradiction.',
        'Recheck whether the final risk wording overstates low risk or discharge readiness.',
      ),
      sourceReference: {
        label: 'High-risk cues',
        targetId: 'high-risk-warning-layer',
      },
      allowedActions: ['ask_atlas', 'show_source', 'mark_reviewed', 'dismiss'],
      suppressUntilSourceChange: true,
      showNudge: true,
      requiresAcknowledgement: urgentRisk,
    });
  }

  const reassuranceWarning = input.highRiskWarnings.find((warning) =>
    includesAny(`${warning.id} ${warning.title} ${warning.detail}`, [
      /reassur/i,
      /low risk/i,
      /no safety concerns/i,
      /medically cleared/i,
      /discharge/i,
      /unsupported/i,
    ]),
  );
  if (reassuranceWarning) {
    const urgentReassurance = includesAny(`${reassuranceWarning.id} ${reassuranceWarning.title} ${reassuranceWarning.detail}`, [
      /\bsuic/i,
      /\bhomic/i,
      /\bacute\b/i,
      /\brecent\b/i,
      /\battempt\b/i,
    ]);
    items.push({
      id: 'atlas-unsupported-reassurance',
      triggerId: 'unsupported_reassurance',
      severity: urgentReassurance ? 'urgent' : 'caution',
      group: 'Documentation',
      summary: urgentReassurance
        ? 'Reassuring wording may hide an acute safety issue.'
        : 'Reassuring wording may not be fully source supported.',
      whyThisMatters: 'Unsupported reassurance can flatten uncertainty, recent risk, or medical overlap that still needs to stay visible in the note.',
      whatToCheck: firstWhatToCheck(
        reassuranceWarning.detail,
        reassuranceWarning.reviewHint,
        'Keep uncertainty, timing, and conflicting facts explicit before finalizing.',
      ),
      sourceReference: {
        label: 'High-risk cues',
        targetId: 'high-risk-warning-layer',
      },
      allowedActions: ['ask_atlas', 'show_source', 'mark_reviewed', 'dismiss'],
      suppressUntilSourceChange: true,
      showNudge: true,
      requiresAcknowledgement: urgentReassurance,
    });
  }

  const mseSuggestion = input.copilotSuggestions.find((item) =>
    includesAny(`${item.title} ${item.detail || ''} ${item.summary || ''}`, [
      /\bmse\b/i,
      /mental status/i,
      /appearance/i,
      /thought process/i,
      /affect/i,
    ]),
  );
  if (input.draftMseTermsNeedingReview.length || mseSuggestion) {
    items.push({
      id: 'atlas-missing-mse',
      triggerId: 'missing_mse',
      severity: 'review',
      group: 'Documentation',
      summary: 'MSE wording may need a source-bound review.',
      whyThisMatters: 'Psych review should keep undocumented MSE elements visibly missing rather than inferring normal findings.',
      whatToCheck: firstWhatToCheck(
        mseSuggestion?.detail,
        input.draftMseTermsNeedingReview[0]
          ? `Review source support for ${input.draftMseTermsNeedingReview[0].entry.label || input.draftMseTermsNeedingReview[0].entry.term || input.draftMseTermsNeedingReview[0].entry.domain || 'the highlighted MSE term'}.`
          : undefined,
        'Keep MSE details limited to what the source or live exam actually supports.',
      ),
      sourceReference: {
        label: 'Terminology review',
        targetId: 'terminology-warning-layer',
      },
      allowedActions: ['ask_atlas', 'mark_reviewed', 'dismiss', 'show_source'],
      suppressUntilSourceChange: true,
      showNudge: true,
    });
  }

  if (input.objectiveConflictBullets.length || input.phaseTwoTrustCues.some((cue) => cue.id === 'objective-conflict')) {
    items.push({
      id: 'atlas-source-conflict',
      triggerId: 'source_conflict',
      severity: 'review',
      group: 'Risk',
      summary: 'Source conflict is still active between narrative and objective findings.',
      whyThisMatters: 'Atlas should preserve contradictions between labs, observed behavior, MAR details, and narrative wording instead of smoothing them away.',
      whatToCheck: firstWhatToCheck(
        input.objectiveConflictBullets[0],
        'Compare the draft against the objective packet before approving the section.',
        'Document separate sources rather than forcing a single reconciled version if the chart does not resolve it.',
      ),
      sourceReference: {
        label: 'Objective data and lab review',
        targetId: 'objective-warning-layer',
      },
      allowedActions: ['ask_atlas', 'show_source', 'mark_reviewed', 'dismiss'],
      suppressUntilSourceChange: true,
    });
  }

  const lithiumWarning = input.medicationScaffoldWarnings.find((warning) =>
    includesAny(`${warning.code} ${warning.title} ${warning.summary} ${warning.whyTriggered.join(' ')}`, [
      /\blithium\b/i,
      /\brenal\b/i,
      /\bcreatinine\b/i,
      /\begfr\b/i,
      /\baki\b/i,
      /\bdehydrat/i,
    ]),
  );
  if (lithiumWarning) {
    items.push({
      id: 'atlas-lithium-renal-safety',
      triggerId: 'lithium_renal_safety',
      severity: medSeverityToAtlasSeverity(lithiumWarning) === 'urgent' ? 'urgent' : 'caution',
      group: 'Medication/Lab',
      summary: 'Lithium renal-safety context needs review before the note feels settled.',
      whyThisMatters: 'Lithium is renally cleared, so renal impairment, dehydration, or interacting medications can increase toxicity risk.',
      whatToCheck: firstWhatToCheck(
        lithiumWarning.summary,
        lithiumWarning.whyTriggered[0],
        'Verify renal trend, dehydration context, and interacting medications before applying clinical conclusions.',
      ),
      sourceReference: {
        label: 'Medication review',
        targetId: 'medication-warning-layer',
      },
      allowedActions: ['ask_atlas', 'show_source', 'mark_reviewed', 'dismiss'],
      suppressUntilSourceChange: true,
      showNudge: true,
      requiresAcknowledgement: medSeverityToAtlasSeverity(lithiumWarning) === 'urgent',
    });
  }

  const urgentMedicationWarning = input.medicationScaffoldWarnings.find((warning) =>
    medSeverityToAtlasSeverity(warning) === 'urgent'
    && includesAny(`${warning.code} ${warning.title} ${warning.summary} ${warning.whyTriggered.join(' ')}`, [
      /\btoxicity\b/i,
      /\boverdose\b/i,
      /\bserotonin\b/i,
      /\bnms\b/i,
      /\bwithdrawal\b/i,
      /\bseizure\b/i,
      /\bdelirium\b/i,
      /\binfection\b/i,
    ]),
  );
  if (urgentMedicationWarning) {
    items.push({
      id: toId('atlas-urgent-med-lab', urgentMedicationWarning.code),
      triggerId: 'urgent_med_lab',
      severity: 'urgent',
      group: 'Medication/Lab',
      summary: 'This medication or lab issue is not routine and needs urgent safety review.',
      whyThisMatters: 'Atlas uses urgent only for serious safety context such as toxicity, severe withdrawal, dangerous symptom-plus-lab combinations, or other high-acuity medication risk.',
      whatToCheck: firstWhatToCheck(
        urgentMedicationWarning.summary,
        urgentMedicationWarning.whyTriggered[0],
        'Use local protocol, prescriber or pharmacy review, poison control, emergency pathway, or medical assessment as appropriate.',
      ),
      sourceReference: {
        label: 'Medication review',
        targetId: 'medication-warning-layer',
      },
      allowedActions: ['ask_atlas', 'show_source', 'mark_reviewed', 'dismiss'],
      suppressUntilSourceChange: true,
      showNudge: true,
      requiresAcknowledgement: true,
    });
  }

  const qtcWarning = input.medicationScaffoldWarnings.find((warning) =>
    includesAny(`${warning.code} ${warning.title} ${warning.summary} ${warning.whyTriggered.join(' ')}`, [
      /\bqtc\b/i,
      /\bqt\b/i,
      /\bsyncope\b/i,
      /\bpalpitation\b/i,
      /\belectrolyte\b/i,
    ]),
  );
  if (qtcWarning) {
    items.push({
      id: 'atlas-qtc-safety',
      triggerId: 'qtc_safety',
      severity: medSeverityToAtlasSeverity(qtcWarning),
      group: 'Medication/Lab',
      summary: medSeverityToAtlasSeverity(qtcWarning) === 'urgent'
        ? 'QTc risk may need urgent safety review.'
        : 'QTc context should be checked before finalizing.',
      whyThisMatters: 'QTc risk depends on symptoms, numeric value, trend, electrolytes, and QT-prolonging medications rather than a single reassuring statement.',
      whatToCheck: firstWhatToCheck(
        qtcWarning.summary,
        qtcWarning.whyTriggered[0],
        'Recheck symptoms, QT-risk medications, and electrolyte context before using reassuring wording.',
      ),
      sourceReference: {
        label: 'Medication review',
        targetId: 'medication-warning-layer',
      },
      allowedActions: ['ask_atlas', 'show_source', 'mark_reviewed', 'dismiss'],
      suppressUntilSourceChange: true,
      showNudge: medSeverityToAtlasSeverity(qtcWarning) !== 'review',
      requiresAcknowledgement: medSeverityToAtlasSeverity(qtcWarning) === 'urgent',
    });
  }

  const clozapineWarning = input.medicationScaffoldWarnings.find((warning) =>
    includesAny(`${warning.code} ${warning.title} ${warning.summary} ${warning.whyTriggered.join(' ')}`, [
      /\bclozapine\b/i,
      /\banc\b/i,
      /\bwbc\b/i,
      /\bneutrop/i,
      /\binfection\b/i,
    ]),
  );
  if (clozapineWarning) {
    items.push({
      id: 'atlas-clozapine-anc',
      triggerId: 'clozapine_anc',
      severity: medSeverityToAtlasSeverity(clozapineWarning),
      group: 'Medication/Lab',
      summary: medSeverityToAtlasSeverity(clozapineWarning) === 'urgent'
        ? 'Clozapine ANC or infection context may need urgent review.'
        : 'Clozapine ANC or WBC context should be checked before final use.',
      whyThisMatters: 'Clozapine lab decisions require current labeling, REMS or local protocol, and careful review of infection symptoms or neutropenia context.',
      whatToCheck: firstWhatToCheck(
        clozapineWarning.summary,
        clozapineWarning.whyTriggered[0],
        'Verify ANC, WBC, infection symptoms, and current protocol context before applying a conclusion.',
      ),
      sourceReference: {
        label: 'Medication review',
        targetId: 'medication-warning-layer',
      },
      allowedActions: ['ask_atlas', 'show_source', 'mark_reviewed', 'dismiss'],
      suppressUntilSourceChange: true,
      showNudge: medSeverityToAtlasSeverity(clozapineWarning) !== 'review',
      requiresAcknowledgement: medSeverityToAtlasSeverity(clozapineWarning) === 'urgent',
    });
  }

  const benzoAlcoholWarning = input.medicationScaffoldWarnings.find((warning) =>
    includesAny(`${warning.code} ${warning.title} ${warning.summary} ${warning.whyTriggered.join(' ')}`, [
      /\bbenzo/i,
      /\bbenzodiazepine\b/i,
      /\balcohol\b/i,
      /\bwithdrawal\b/i,
      /\bdelirium\b/i,
      /\bseizure\b/i,
    ]),
  );
  if (benzoAlcoholWarning) {
    items.push({
      id: 'atlas-benzo-alcohol-withdrawal',
      triggerId: 'benzo_alcohol_withdrawal',
      severity: 'urgent',
      group: 'Medication/Lab',
      summary: 'Benzodiazepine or alcohol withdrawal context needs urgent safety review.',
      whyThisMatters: 'Abrupt benzodiazepine discontinuation or alcohol withdrawal can become high-acuity quickly, especially with seizure, delirium, or autonomic-risk language.',
      whatToCheck: firstWhatToCheck(
        benzoAlcoholWarning.summary,
        benzoAlcoholWarning.whyTriggered[0],
        'Use protocol-based withdrawal review and do not treat this as routine symptom wording.',
      ),
      sourceReference: {
        label: 'Medication review',
        targetId: 'medication-warning-layer',
      },
      allowedActions: ['ask_atlas', 'show_source', 'mark_reviewed', 'dismiss'],
      suppressUntilSourceChange: true,
      showNudge: true,
      requiresAcknowledgement: true,
    });
  }

  const laiWarning = input.medicationScaffoldWarnings.find((warning) =>
    includesAny(`${warning.code} ${warning.title} ${warning.summary} ${warning.whyTriggered.join(' ')}`, [
      /\blai\b/i,
      /long-acting/i,
      /\bmissed dose\b/i,
      /\brestart\b/i,
      /\bloading\b/i,
      /\boverlap\b/i,
      /\bconversion\b/i,
    ]),
  );
  if (laiWarning) {
    items.push({
      id: 'atlas-lai-product-specific',
      triggerId: 'lai_product_specific',
      severity: 'review',
      group: 'Medication/Lab',
      summary: 'LAI wording may need product-specific verification.',
      whyThisMatters: 'LAI initiation, restart, overlap, and missed-dose logic can be product specific and should not be flattened into generic wording.',
      whatToCheck: firstWhatToCheck(
        laiWarning.summary,
        laiWarning.whyTriggered[0],
        'Verify the exact product, timing, and labeling or pharmacy guidance before applying it clinically.',
      ),
      sourceReference: {
        label: 'Medication review',
        targetId: 'medication-warning-layer',
      },
      allowedActions: ['ask_atlas', 'show_source', 'mark_reviewed', 'dismiss'],
      suppressUntilSourceChange: true,
    });
  }

  if (!items.length && (input.reviewCounts.needsReview || input.reviewCounts.unreviewed || input.destinationConstraintActive || input.encounterDocumentationChecks.length)) {
    items.push({
      id: 'atlas-workflow-review',
      triggerId: 'missing_mse',
      severity: 'review',
      group: 'Workflow',
      summary: 'Atlas review is quiet right now, but the draft still has review work open.',
      whyThisMatters: 'Atlas stays silent by default and should only add pressure when a documentation or safety issue looks worth checking.',
      whatToCheck: firstWhatToCheck(
        input.encounterDocumentationChecks[0]?.label,
        input.encounterDocumentationChecks[0]?.detail,
        input.destinationConstraintActive ? 'Recheck destination cleanup before final copy.' : undefined,
      ),
      sourceReference: {
        label: 'Finish lane',
        targetId: 'phase-two-trust-layer',
      },
      allowedActions: ['ask_atlas', 'dismiss', 'mark_reviewed'],
      suppressUntilSourceChange: true,
    });
  }

  return items;
}

export function buildAtlasNudges(items: AtlasReviewItem[]) {
  return items.filter((item) => item.severity === 'caution' || item.severity === 'urgent' || (item.severity === 'review' && item.showNudge));
}
