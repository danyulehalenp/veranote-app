import type { DraftSession } from '@/types/session';

export const FICTIONAL_DRAFT_EXAMPLE_PROVIDER_ID = 'provider-daniel-hale-beta';

export const FICTIONAL_DRAFT_EXAMPLE_IDS = [
  'fictional-example-daniel-outpatient-followup-messy',
  'fictional-example-daniel-wellsky-inpatient-risk-conflict',
  'fictional-example-daniel-ocr-referral-evaluation',
  'fictional-example-daniel-therapy-progress-cbt',
] as const;

type FictionalDraftSeed = DraftSession & {
  draftId: typeof FICTIONAL_DRAFT_EXAMPLE_IDS[number];
};

function buildRecoveryState(updatedAt: string): DraftSession['recoveryState'] {
  return {
    workflowStage: 'review',
    composeLane: 'finish',
    recommendedStage: 'review',
    updatedAt,
  };
}

function buildBaseSeed(input: {
  id: typeof FICTIONAL_DRAFT_EXAMPLE_IDS[number];
  updatedAt: string;
  specialty: string;
  role: string;
  noteType: string;
  template: string;
  outputStyle?: string;
  format?: string;
  customInstructions: string;
  sourceSections: Record<string, string>;
  note: string;
  flags?: string[];
}): FictionalDraftSeed {
  const sourceInput = Object.entries(input.sourceSections)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n\n');

  return {
    draftId: input.id,
    providerIdentityId: FICTIONAL_DRAFT_EXAMPLE_PROVIDER_ID,
    lastSavedAt: input.updatedAt,
    specialty: input.specialty,
    role: input.role,
    noteType: input.noteType,
    template: input.template,
    outputStyle: input.outputStyle || 'Concise',
    format: input.format || 'Labeled Sections',
    keepCloserToSource: true,
    flagMissingInfo: true,
    outputScope: 'full-note',
    customInstructions: input.customInstructions,
    sourceInput,
    sourceSections: input.sourceSections,
    note: input.note,
    flags: ['fictional-example', 'no-phi', ...(input.flags || [])],
    copilotSuggestions: [
      {
        severity: 'review',
        title: 'Fictional training example',
        detail: 'Synthetic no-PHI draft for testing Saved Drafts, resume, review, and EHR formatting workflows.',
      },
    ],
    sectionReviewState: {
      sourceFidelity: {
        heading: 'Source fidelity',
        status: 'needs-review',
        confirmedEvidenceBlockIds: [],
        reviewerComment: 'Review source conflicts before copying this example note.',
      },
    },
    recoveryState: buildRecoveryState(input.updatedAt),
    mode: 'live',
  };
}

export function getFictionalDraftExampleSeeds(
  providerId: string,
  updatedAt = new Date().toISOString(),
): FictionalDraftSeed[] {
  if (providerId !== FICTIONAL_DRAFT_EXAMPLE_PROVIDER_ID) {
    return [];
  }

  return [
    buildBaseSeed({
      id: 'fictional-example-daniel-outpatient-followup-messy',
      updatedAt,
      specialty: 'Psychiatry',
      role: 'Psychiatric NP',
      noteType: 'Outpatient Psych Follow-Up',
      template: 'Fictional messy outpatient follow-up',
      outputStyle: 'Concise',
      customInstructions: 'Turn messy outpatient source into a concise follow-up note. Preserve missed-dose uncertainty and do not invent normal MSE findings.',
      sourceSections: {
        'Pre-visit data': 'FICTIONAL EXAMPLE - NO PHI. Last note said anxiety and depression follow-up. Refill history suggests two missed doses last week. PHQ-9 trend not available.',
        'Visit notes': 'Pt says sleep better, about 6 hrs instead of 4. still anxious at work. denies si/hi. no panic this week. forgot meds x2 because schedule changed.',
        'Provider add-on': 'Keep as brief med-management follow-up. Do not include CPT. Mention adherence nuance without scolding language.',
      },
      note: [
        'FICTIONAL EXAMPLE - NO PHI.',
        '',
        'Interval History: Patient reports partial improvement in sleep from approximately 4 hours to 6 hours, with ongoing work-related anxiety. Patient denies SI/HI in the current source. Source notes two missed medication doses last week related to schedule change, so adherence should be documented as imperfect rather than fully consistent.',
        '',
        'Mental Status / Observations: Mood/anxiety symptoms are documented by report. Other MSE domains are not supported by the available source and should remain unfilled unless reviewed directly.',
        '',
        'Assessment / Plan: Continue outpatient follow-up documentation with attention to sleep, anxiety, adherence barriers, and safety review. No CPT code is included in this fictional example.',
      ].join('\n'),
      flags: ['outpatient-followup', 'messy-source'],
    }),
    buildBaseSeed({
      id: 'fictional-example-daniel-wellsky-inpatient-risk-conflict',
      updatedAt,
      specialty: 'Psychiatry',
      role: 'Psychiatric NP',
      noteType: 'Inpatient Psych Progress Note',
      template: 'Fictional WellSky inpatient risk conflict',
      outputStyle: 'WellSky-ready',
      customInstructions: 'Format for WellSky-friendly copy/paste. Preserve patient denial and collateral risk conflict without calling risk resolved.',
      sourceSections: {
        'Pre-visit data': 'FICTIONAL EXAMPLE - NO PHI. Nursing: isolated to room, skipped group, slept poorly. Collateral from family says patient texted goodbye last night.',
        'Visit notes': 'Pt denies SI today and says wants d/c. Affect flat. Gives short answers. Says family overreacting. No hallucinations reported today.',
        'Provider add-on': 'Need risk language careful. Do not say no risk. WellSky copy-paste style, ASCII safe, clear sections.',
      },
      note: [
        'FICTIONAL EXAMPLE - NO PHI.',
        '',
        'Interval Update: Patient denies current SI and requests discharge, but collateral reports goodbye-text language last night. Nursing source also notes isolation, missed group, and poor sleep. The denial and collateral conflict should remain visible in the risk assessment rather than summarized as reassuring.',
        '',
        'MSE / Observations: Affect described as flat with brief responses. No hallucinations are reported in the current patient source. Other MSE domains are not completed from the available source.',
        '',
        'Safety / Risk: Current denial of SI is documented. Collateral concern remains clinically relevant. Source does not support wording such as no risk, risk resolved, or safe for discharge.',
        '',
        'Plan: Continue inpatient monitoring and source review. Clarify collateral details, current safety plan, sleep, group participation, and discharge readiness before finalizing.',
      ].join('\n'),
      flags: ['wellsky', 'risk-conflict'],
    }),
    buildBaseSeed({
      id: 'fictional-example-daniel-ocr-referral-evaluation',
      updatedAt,
      specialty: 'Psychiatry',
      role: 'Psychiatric NP',
      noteType: 'Psychiatric H&P',
      template: 'Fictional OCR referral evaluation',
      outputStyle: 'Source-first',
      customInstructions: 'Organize referral-style source into an evaluation draft. Separate scanned-document uncertainty from confirmed history.',
      sourceSections: {
        'Uploaded document text': 'FICTIONAL EXAMPLE - NO PHI. OCR referral: prior dx maybe bipolar? word unclear. med list says lithium 300 bid but patient says stopped 2 weeks ago due tremor. Creatinine listed 1.4, date unclear.',
        'Visit notes': 'Patient reports mood swings and poor sleep, denies current SI/HI. Says not taking lithium currently. No verified lithium level in packet.',
        'Provider add-on': 'Do not diagnose from referral alone. Highlight med reconciliation discrepancy and renal/lab uncertainty.',
      },
      note: [
        'FICTIONAL EXAMPLE - NO PHI.',
        '',
        'Reason for Evaluation / HPI: Referral source suggests a prior bipolar-spectrum diagnosis, but the OCR text is unclear and should not be treated as confirmed. Patient reports mood swings and poor sleep and denies current SI/HI in the available visit source.',
        '',
        'Medication / Lab Reconciliation: Referral medication list includes lithium 300 mg twice daily, while patient reports stopping lithium two weeks ago due to tremor. Creatinine is listed as 1.4 with unclear date, and no verified lithium level is included in the packet. The discrepancy should be reconciled rather than converted into a current medication plan.',
        '',
        'Assessment / Plan: Diagnostic formulation remains provisional pending full clinical assessment, collateral/history clarification, medication reconciliation, and lab-date verification.',
      ].join('\n'),
      flags: ['ocr-referral', 'med-reconciliation'],
    }),
    buildBaseSeed({
      id: 'fictional-example-daniel-therapy-progress-cbt',
      updatedAt,
      specialty: 'Therapy',
      role: 'Therapist',
      noteType: 'Therapy Progress Note',
      template: 'Fictional therapy CBT progress',
      outputStyle: 'Therapy note',
      customInstructions: 'Shape into a therapy progress note with CBT intervention language. Keep school and safety-plan source status clear.',
      sourceSections: {
        'Pre-visit data': 'FICTIONAL EXAMPLE - NO PHI. School counselor reports attendance slipping, parent requested ROI but signed ROI not yet uploaded. 504 plan mentioned but details not in chart.',
        'Session notes': 'Adolescent practiced thought record for worry about failing class. Tearful at start, calmer by end. Denies current SI. Safety plan started last week but final copy not in uploaded source.',
        'Provider add-on': 'Use CBT language. Do not imply ROI complete or full safety plan finalized.',
      },
      note: [
        'FICTIONAL EXAMPLE - NO PHI.',
        '',
        'Session Focus: Patient worked on school-related anxiety and practiced a CBT thought record around fear of failing class. Patient was tearful at the start of session and calmer by the end. Patient denies current SI in the available source.',
        '',
        'Interventions / Response: CBT-based cognitive restructuring and skills practice were used. Patient engaged in identifying worry thoughts and alternative balanced thoughts.',
        '',
        'Collateral / Documentation Limits: School attendance concerns are reported by counselor source. ROI is requested but not documented as uploaded, and 504 details are not available in the current source. Safety planning was started last week, but the final copy is not present in the uploaded material.',
        '',
        'Plan: Continue therapy work on school anxiety, coping practice, and source-supported safety planning follow-up. Do not document ROI completion or finalized safety plan unless source support is added.',
      ].join('\n'),
      flags: ['therapy', 'cbt', 'school-collateral'],
    }),
  ];
}
