import { describe, expect, it } from 'vitest';
import { planSections, resolveNoteProfile } from '@/lib/note/section-profiles';

describe('section profiles', () => {
  it('resolves psychiatry follow-up profile', () => {
    const profile = resolveNoteProfile('Psychiatry follow-up');
    expect(profile?.id).toBe('psychiatry-follow-up');
  });

  it('does not require standalone MSE for psychiatry HPI-only scope', () => {
    const plan = planSections({
      noteType: 'Psychiatry follow-up',
      requestedScope: 'hpi-only',
    });

    expect(plan.scope).toBe('hpi-only');
    expect(plan.requiresStandaloneMse).toBe(false);
    expect(plan.sections).toEqual(['intervalUpdate']);
  });

  it('does require standalone MSE for psychiatry full-note scope', () => {
    const plan = planSections({
      noteType: 'Psychiatry follow-up',
      requestedScope: 'full-note',
    });

    expect(plan.requiresStandaloneMse).toBe(true);
    expect(plan.sections).toContain('mentalStatus');
  });

  it('uses requested selected sections when valid', () => {
    const plan = planSections({
      noteType: 'Inpatient psych progress note',
      requestedScope: 'selected-sections',
      requestedSections: ['progressIntervalHistoryPatientReport', 'assessmentClinicalFormulation', 'progressPlanContinuedHospitalization'],
    });

    expect(plan.scope).toBe('selected-sections');
    expect(plan.sections).toEqual(['progressIntervalHistoryPatientReport', 'assessmentClinicalFormulation', 'progressPlanContinuedHospitalization']);
    expect(plan.requiresStandaloneMse).toBe(false);
  });

  it('uses progress-note-specific sections for inpatient psych progress notes', () => {
    const plan = planSections({
      noteType: 'Inpatient Psych Progress Note',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('inpatient-psych-progress');
    expect(plan.sections).toEqual([
      'progressReasonIntervalConcern',
      'sourceOfInformation',
      'progressIntervalHistoryPatientReport',
      'progressStaffNursingCollateralObservations',
      'mentalStatusExamObservations',
      'riskAssessment',
      'progressMedicationsTreatmentAdherence',
      'assessmentClinicalFormulation',
      'progressPlanContinuedHospitalization',
      'sourceLimitations',
    ]);
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('uses crisis-specific sections for psychiatric crisis notes', () => {
    const plan = planSections({
      noteType: 'Psychiatric Crisis Note',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('psychiatric-crisis-note');
    expect(plan.sections).toEqual([
      'reasonForCrisisEvaluation',
      'sourceOfInformation',
      'crisisEventsObjectiveBehavior',
      'patientReport',
      'safetyRisk',
      'interventionsProvided',
      'patientResponseToIntervention',
      'assessmentClinicalImpression',
      'planMonitoringDisposition',
      'sourceLimitations',
    ]);
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('uses risk-heavy-specific sections for risk-heavy notes', () => {
    const plan = planSections({
      noteType: 'Risk-Heavy Note',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('risk-heavy-note');
    expect(plan.sections).toEqual([
      'reasonForRiskReview',
      'sourceOfInformation',
      'currentPatientReport',
      'recentCollateralRiskEvidence',
      'mentalStatusBehavioralObservations',
      'riskAssessment',
      'protectiveFactorsSupports',
      'assessmentClinicalFormulation',
      'planSafetyMonitoring',
      'sourceLimitations',
    ]);
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('uses discharge-summary-specific sections for inpatient psych discharge summaries', () => {
    const plan = planSections({
      noteType: 'Inpatient Psych Discharge Summary',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('inpatient-psych-discharge-summary');
    expect(plan.sections).toEqual([
      'reasonForAdmission',
      'sourceOfInformation',
      'hospitalCourse',
      'behavioralSymptomCourse',
      'mentalStatusAtDischarge',
      'riskAssessmentAtDischarge',
      'safetyPlanDischargeReadiness',
      'dischargeCondition',
      'dischargeMedications',
      'followUpAftercare',
      'dischargeInstructionsReturnPrecautions',
      'sourceLimitations',
    ]);
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('uses substance-vs-psych-specific sections for overlap notes', () => {
    const plan = planSections({
      noteType: 'Substance-vs-Psych Overlap Note',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('substance-vs-psych-overlap-note');
    expect(plan.sections).toEqual([
      'reasonForEvaluationPresentingConcern',
      'sourceOfInformation',
      'substanceUseExposureTimeline',
      'psychiatricSymptomsBehavioralObservations',
      'medicalWithdrawalToxicologyInformation',
      'mentalStatusExamObservations',
      'riskAssessment',
      'diagnosticUncertaintyDifferential',
      'assessmentClinicalFormulation',
      'planMonitoringReassessment',
      'sourceLimitations',
    ]);
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('uses medical-vs-psych-specific sections for overlap notes', () => {
    const plan = planSections({
      noteType: 'Medical-vs-Psych Overlap Note',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('medical-vs-psych-overlap-note');
    expect(plan.sections).toEqual([
      'reasonForEvaluationConsult',
      'sourceOfInformation',
      'presentingSymptomsClinicalConcern',
      'medicalContributorsRedFlags',
      'psychiatricSymptomsBehavioralObservations',
      'medicalWorkupMissingEvaluation',
      'mentalStatusExamObservations',
      'riskAssessment',
      'diagnosticUncertaintyDifferential',
      'assessmentClinicalFormulation',
      'planMonitoringWorkup',
      'sourceLimitations',
    ]);
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('uses collateral-heavy-specific sections for collateral-heavy notes', () => {
    const plan = planSections({
      noteType: 'Collateral-Heavy Note',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('collateral-heavy-note');
    expect(plan.sections).toEqual([
      'reasonForReviewPresentingConcern',
      'sourceOfInformation',
      'patientReport',
      'collateralReport',
      'chartOrStaffReport',
      'mentalStatusBehavioralObservations',
      'riskAssessment',
      'assessmentClinicalFormulation',
      'planFollowUpVerification',
      'sourceLimitations',
    ]);
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('uses sparse-source-specific sections for sparse source notes', () => {
    const plan = planSections({
      noteType: 'Sparse Source Note',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('sparse-source-note');
    expect(plan.sections).toEqual([
      'sparseReasonLimitedSourceContext',
      'sourceOfInformation',
      'sparseDocumentedFacts',
      'patientReport',
      'sparseCollateralStaffChartInformation',
      'mentalStatusExamObservations',
      'riskAssessment',
      'assessmentClinicalFormulation',
      'sparsePlanNextSteps',
      'sourceLimitations',
    ]);
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('uses outpatient-follow-up-specific sections for outpatient psych follow-up notes', () => {
    const plan = planSections({
      noteType: 'Outpatient Psych Follow-Up',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('outpatient-psych-follow-up');
    expect(plan.sections).toEqual([
      'outpatientReasonFollowUpFocus',
      'sourceOfInformation',
      'progressIntervalHistoryPatientReport',
      'outpatientSymptomsFunctionalStatus',
      'mentalStatusExamObservations',
      'riskAssessment',
      'outpatientMedicationsAdherenceSideEffects',
      'assessmentClinicalFormulation',
      'outpatientPlanFollowUp',
      'sourceLimitations',
    ]);
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('uses medical-consult-specific sections for medical consultation notes', () => {
    const plan = planSections({
      noteType: 'Medical Consultation Note',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('medical-consult-note');
    expect(plan.sections).toEqual([
      'consultReasonForConsultation',
      'sourceOfInformation',
      'consultQuestionClinicalConcern',
      'consultRelevantHistoryHpi',
      'consultPertinentExamObservations',
      'mentalStatusBehavioralObservations',
      'consultPertinentLabsVitalsDiagnostics',
      'consultAssessmentMedicalImpression',
      'consultRecommendationsPlan',
      'sourceLimitations',
    ]);
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('uses medical-H&P-specific sections for medical H&P notes', () => {
    const plan = planSections({
      noteType: 'Medical H&P',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('medical-h-and-p');
    expect(plan.sections).toEqual([
      'medicalHpReasonAdmissionContext',
      'sourceOfInformation',
      'medicalHpHistoryOfPresentIllness',
      'medicalHpPastMedicalHistory',
      'medicalHpMedicationsAllergies',
      'medicalHpReviewOfSystems',
      'medicalHpPhysicalExamObservations',
      'medicalHpPertinentLabsVitalsDiagnostics',
      'medicalHpAssessmentMedicalProblems',
      'medicalHpPlanRecommendations',
      'sourceLimitations',
    ]);
    expect(plan.requiresStandaloneMse).toBe(false);
  });

  it('includes larger adult eval structure for psych initial adult eval full-note scope', () => {
    const plan = planSections({
      noteType: 'Inpatient psych initial adult eval',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('psych-initial-adult-eval');
    expect(plan.sections).toContain('mentalStatus');
    expect(plan.sections).toContain('hospitalizationJustification');
    expect(plan.sections).toContain('attestation');
    expect(plan.sections).toContain('familyHistory');
    expect(plan.sections).toContain('legalHistory');
    expect(plan.requiresStandaloneMse).toBe(true);
  });

  it('includes adolescent-specific eval structure for psych initial adolescent eval full-note scope', () => {
    const plan = planSections({
      noteType: 'Inpatient psych initial adolescent eval',
      requestedScope: 'full-note',
    });

    expect(plan.profile?.id).toBe('psych-initial-adolescent-eval');
    expect(plan.sections).toContain('developmentalEducationalHistory');
    expect(plan.sections).toContain('familyHistory');
    expect(plan.sections).toContain('traumaHistory');
    expect(plan.requiresStandaloneMse).toBe(true);
  });
});
