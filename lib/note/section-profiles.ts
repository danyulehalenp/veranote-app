export type NoteSectionKey =
  | 'chiefConcern'
  | 'intervalUpdate'
  | 'symptomReview'
  | 'medications'
  | 'mentalStatus'
  | 'insightJudgment'
  | 'safetyRisk'
  | 'assessment'
  | 'plan'
  | 'psychHistory'
  | 'substanceHistory'
  | 'priorTreatment'
  | 'socialHistory'
  | 'familyHistory'
  | 'developmentalEducationalHistory'
  | 'traumaHistory'
  | 'legalHistory'
  | 'constitutionalReview'
  | 'musculoskeletalExam'
  | 'strengthsLimitations'
  | 'reasonForCrisisEvaluation'
  | 'sourceOfInformation'
  | 'crisisEventsObjectiveBehavior'
  | 'patientReport'
  | 'interventionsProvided'
  | 'patientResponseToIntervention'
  | 'assessmentClinicalImpression'
  | 'planMonitoringDisposition'
  | 'sourceLimitations'
  | 'reasonForRiskReview'
  | 'currentPatientReport'
  | 'recentCollateralRiskEvidence'
  | 'mentalStatusBehavioralObservations'
  | 'riskAssessment'
  | 'protectiveFactorsSupports'
  | 'assessmentClinicalFormulation'
  | 'planSafetyMonitoring'
  | 'reasonForAdmission'
  | 'hospitalCourse'
  | 'behavioralSymptomCourse'
  | 'mentalStatusAtDischarge'
  | 'riskAssessmentAtDischarge'
  | 'safetyPlanDischargeReadiness'
  | 'dischargeCondition'
  | 'dischargeMedications'
  | 'followUpAftercare'
  | 'dischargeInstructionsReturnPrecautions'
  | 'reasonForEvaluationPresentingConcern'
  | 'substanceUseExposureTimeline'
  | 'psychiatricSymptomsBehavioralObservations'
  | 'medicalWithdrawalToxicologyInformation'
  | 'mentalStatusExamObservations'
  | 'diagnosticUncertaintyDifferential'
  | 'planMonitoringReassessment'
  | 'reasonForEvaluationConsult'
  | 'presentingSymptomsClinicalConcern'
  | 'medicalContributorsRedFlags'
  | 'medicalWorkupMissingEvaluation'
  | 'planMonitoringWorkup'
  | 'reasonForReviewPresentingConcern'
  | 'collateralReport'
  | 'chartOrStaffReport'
  | 'planFollowUpVerification'
  | 'progressReasonIntervalConcern'
  | 'progressIntervalHistoryPatientReport'
  | 'progressStaffNursingCollateralObservations'
  | 'progressMedicationsTreatmentAdherence'
  | 'progressPlanContinuedHospitalization'
  | 'sparseReasonLimitedSourceContext'
  | 'sparseDocumentedFacts'
  | 'sparseCollateralStaffChartInformation'
  | 'sparsePlanNextSteps'
  | 'outpatientReasonFollowUpFocus'
  | 'outpatientSymptomsFunctionalStatus'
  | 'outpatientMedicationsAdherenceSideEffects'
  | 'outpatientPlanFollowUp'
  | 'consultReasonForConsultation'
  | 'consultQuestionClinicalConcern'
  | 'consultRelevantHistoryHpi'
  | 'consultPertinentExamObservations'
  | 'consultPertinentLabsVitalsDiagnostics'
  | 'consultAssessmentMedicalImpression'
  | 'consultRecommendationsPlan'
  | 'medicalHpReasonAdmissionContext'
  | 'medicalHpHistoryOfPresentIllness'
  | 'medicalHpPastMedicalHistory'
  | 'medicalHpMedicationsAllergies'
  | 'medicalHpReviewOfSystems'
  | 'medicalHpPhysicalExamObservations'
  | 'medicalHpPertinentLabsVitalsDiagnostics'
  | 'medicalHpAssessmentMedicalProblems'
  | 'medicalHpPlanRecommendations'
  | 'diagnosis'
  | 'medicalDiagnosis'
  | 'proposedDischarge'
  | 'hospitalizationJustification'
  | 'attestation'
  | 'clinicalStatusComplexity';

export type OutputScope = 'hpi-only' | 'selected-sections' | 'full-note';

export type NoteProfile = {
  id: string;
  label: string;
  noteTypeMatches: RegExp[];
  defaultScope: OutputScope;
  availableSections: NoteSectionKey[];
  defaultSectionsByScope: Record<OutputScope, NoteSectionKey[]>;
  requiresStandaloneMseByScope: Partial<Record<OutputScope, boolean>>;
};

export const SECTION_LABELS: Record<NoteSectionKey, string> = {
  chiefConcern: 'Chief Complaint / Chief Concern',
  intervalUpdate: 'Interval Update / HPI',
  symptomReview: 'Symptom Review',
  medications: 'Medications / Adherence / Side Effects',
  mentalStatus: 'Mental Status / Observations',
  insightJudgment: 'Insight / Judgment',
  safetyRisk: 'Safety / Risk',
  assessment: 'Assessment',
  plan: 'Plan',
  psychHistory: 'Psychiatric History',
  substanceHistory: 'Substance History',
  priorTreatment: 'Prior Treatment',
  socialHistory: 'Social History',
  familyHistory: 'Family Psychiatric / Relevant Family History',
  developmentalEducationalHistory: 'Developmental / Educational History',
  traumaHistory: 'Trauma / Abuse History',
  legalHistory: 'Legal History',
  constitutionalReview: 'Constitutional Review',
  musculoskeletalExam: 'Musculoskeletal Exam',
  strengthsLimitations: 'Patient Strengths and Limitations',
  reasonForCrisisEvaluation: 'Reason for Crisis Evaluation / Presenting Concern',
  sourceOfInformation: 'Source of Information',
  crisisEventsObjectiveBehavior: 'Crisis Events / Objective Behavior',
  patientReport: 'Patient Report',
  interventionsProvided: 'Interventions Provided',
  patientResponseToIntervention: 'Patient Response to Intervention',
  assessmentClinicalImpression: 'Assessment / Clinical Impression',
  planMonitoringDisposition: 'Plan / Monitoring / Disposition',
  sourceLimitations: 'Source Limitations / Missing Information',
  reasonForRiskReview: 'Reason for Risk Review / Presenting Concern',
  currentPatientReport: 'Current Patient Report',
  recentCollateralRiskEvidence: 'Recent or Collateral Risk Evidence',
  mentalStatusBehavioralObservations: 'Mental Status / Behavioral Observations',
  riskAssessment: 'Risk Assessment',
  protectiveFactorsSupports: 'Protective Factors / Supports',
  assessmentClinicalFormulation: 'Assessment / Clinical Formulation',
  planSafetyMonitoring: 'Plan / Safety / Monitoring',
  reasonForAdmission: 'Reason for Admission',
  hospitalCourse: 'Hospital Course',
  behavioralSymptomCourse: 'Behavioral / Symptom Course',
  mentalStatusAtDischarge: 'Mental Status at Discharge',
  riskAssessmentAtDischarge: 'Risk Assessment at Discharge',
  safetyPlanDischargeReadiness: 'Safety Plan / Discharge Readiness',
  dischargeCondition: 'Discharge Condition',
  dischargeMedications: 'Discharge Medications',
  followUpAftercare: 'Follow-Up / Aftercare',
  dischargeInstructionsReturnPrecautions: 'Discharge Instructions / Return Precautions',
  reasonForEvaluationPresentingConcern: 'Reason for Evaluation / Presenting Concern',
  substanceUseExposureTimeline: 'Substance Use History / Exposure Timeline',
  psychiatricSymptomsBehavioralObservations: 'Psychiatric Symptoms / Behavioral Observations',
  medicalWithdrawalToxicologyInformation: 'Medical / Withdrawal / Toxicology Information',
  mentalStatusExamObservations: 'Mental Status Exam / Observations',
  diagnosticUncertaintyDifferential: 'Diagnostic Uncertainty / Differential',
  planMonitoringReassessment: 'Plan / Monitoring / Reassessment',
  reasonForEvaluationConsult: 'Reason for Evaluation / Consult',
  presentingSymptomsClinicalConcern: 'Presenting Symptoms / Clinical Concern',
  medicalContributorsRedFlags: 'Medical Contributors / Red Flags',
  medicalWorkupMissingEvaluation: 'Medical Workup / Missing Evaluation',
  planMonitoringWorkup: 'Plan / Monitoring / Workup',
  reasonForReviewPresentingConcern: 'Reason for Review / Presenting Concern',
  collateralReport: 'Collateral Report',
  chartOrStaffReport: 'Chart or Staff Report',
  planFollowUpVerification: 'Plan / Follow-Up / Verification',
  progressReasonIntervalConcern: 'Reason for Follow-Up / Interval Concern',
  progressIntervalHistoryPatientReport: 'Interval Events / Patient Report (Subjective)',
  progressStaffNursingCollateralObservations: 'Staff / Nursing / Collateral Observations (Objective)',
  progressMedicationsTreatmentAdherence: 'Medications / Treatment Adherence',
  progressPlanContinuedHospitalization: 'Plan / Continued Hospitalization',
  sparseReasonLimitedSourceContext: 'Reason for Note / Limited Source Context',
  sparseDocumentedFacts: 'Documented Facts',
  sparseCollateralStaffChartInformation: 'Collateral / Staff / Chart Information',
  sparsePlanNextSteps: 'Plan / Next Steps',
  outpatientReasonFollowUpFocus: 'Reason for Visit / Follow-Up Focus',
  outpatientSymptomsFunctionalStatus: 'Symptoms / Functional Status',
  outpatientMedicationsAdherenceSideEffects: 'Medications / Adherence / Side Effects',
  outpatientPlanFollowUp: 'Plan / Follow-Up',
  consultReasonForConsultation: 'Reason for Consultation',
  consultQuestionClinicalConcern: 'Consult Question / Clinical Concern',
  consultRelevantHistoryHpi: 'Relevant History / HPI',
  consultPertinentExamObservations: 'Pertinent Exam / Observations',
  consultPertinentLabsVitalsDiagnostics: 'Pertinent Labs / Vitals / Diagnostics',
  consultAssessmentMedicalImpression: 'Assessment / Medical Impression',
  consultRecommendationsPlan: 'Recommendations / Plan',
  medicalHpReasonAdmissionContext: 'Reason for Medical H&P / Admission Context',
  medicalHpHistoryOfPresentIllness: 'History of Present Illness',
  medicalHpPastMedicalHistory: 'Past Medical History',
  medicalHpMedicationsAllergies: 'Medications / Allergies',
  medicalHpReviewOfSystems: 'Review of Systems',
  medicalHpPhysicalExamObservations: 'Physical Exam / Observations',
  medicalHpPertinentLabsVitalsDiagnostics: 'Pertinent Labs / Vitals / Diagnostics',
  medicalHpAssessmentMedicalProblems: 'Assessment / Medical Problems',
  medicalHpPlanRecommendations: 'Plan / Recommendations',
  diagnosis: 'Psychiatric Diagnosis',
  medicalDiagnosis: 'Medical Diagnosis / Medical Conditions',
  proposedDischarge: 'Plan / Proposed Discharge',
  hospitalizationJustification: 'Justification of Hospitalization',
  attestation: 'Attestation',
  clinicalStatusComplexity: 'Clinical Status / Complexity',
};

export const NOTE_PROFILES: NoteProfile[] = [
  {
    id: 'inpatient-psych-discharge-summary',
    label: 'Inpatient Psych Discharge Summary',
    noteTypeMatches: [/inpatient psych discharge/i, /psych discharge summary/i],
    defaultScope: 'full-note',
    availableSections: [
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
    ],
    defaultSectionsByScope: {
      'hpi-only': ['reasonForAdmission', 'hospitalCourse'],
      'selected-sections': ['hospitalCourse', 'riskAssessmentAtDischarge', 'safetyPlanDischargeReadiness', 'dischargeCondition', 'followUpAftercare'],
      'full-note': [
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
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'psychiatric-crisis-note',
    label: 'Psychiatric Crisis Note',
    noteTypeMatches: [/psychiatric crisis/i, /psych crisis/i],
    defaultScope: 'full-note',
    availableSections: [
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
    ],
    defaultSectionsByScope: {
      'hpi-only': ['reasonForCrisisEvaluation', 'crisisEventsObjectiveBehavior'],
      'selected-sections': ['crisisEventsObjectiveBehavior', 'safetyRisk', 'interventionsProvided', 'patientResponseToIntervention', 'planMonitoringDisposition'],
      'full-note': [
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
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'risk-heavy-note',
    label: 'Risk-Heavy Note',
    noteTypeMatches: [/risk-heavy note/i, /risk heavy note/i],
    defaultScope: 'full-note',
    availableSections: [
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
    ],
    defaultSectionsByScope: {
      'hpi-only': ['reasonForRiskReview', 'currentPatientReport', 'recentCollateralRiskEvidence'],
      'selected-sections': ['currentPatientReport', 'recentCollateralRiskEvidence', 'riskAssessment', 'protectiveFactorsSupports', 'planSafetyMonitoring'],
      'full-note': [
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
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'substance-vs-psych-overlap-note',
    label: 'Substance-vs-Psych Overlap Note',
    noteTypeMatches: [/substance-vs-psych overlap/i, /substance vs psych overlap/i],
    defaultScope: 'full-note',
    availableSections: [
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
    ],
    defaultSectionsByScope: {
      'hpi-only': ['reasonForEvaluationPresentingConcern', 'substanceUseExposureTimeline', 'psychiatricSymptomsBehavioralObservations'],
      'selected-sections': ['substanceUseExposureTimeline', 'psychiatricSymptomsBehavioralObservations', 'riskAssessment', 'diagnosticUncertaintyDifferential', 'planMonitoringReassessment'],
      'full-note': [
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
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'medical-vs-psych-overlap-note',
    label: 'Medical-vs-Psych Overlap Note',
    noteTypeMatches: [/medical-vs-psych overlap/i, /medical vs psych overlap/i],
    defaultScope: 'full-note',
    availableSections: [
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
    ],
    defaultSectionsByScope: {
      'hpi-only': ['reasonForEvaluationConsult', 'presentingSymptomsClinicalConcern', 'medicalContributorsRedFlags'],
      'selected-sections': ['medicalContributorsRedFlags', 'medicalWorkupMissingEvaluation', 'mentalStatusExamObservations', 'riskAssessment', 'planMonitoringWorkup'],
      'full-note': [
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
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'collateral-heavy-note',
    label: 'Collateral-Heavy Note',
    noteTypeMatches: [/collateral-heavy note/i, /collateral heavy note/i],
    defaultScope: 'full-note',
    availableSections: [
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
    ],
    defaultSectionsByScope: {
      'hpi-only': ['reasonForReviewPresentingConcern', 'patientReport', 'collateralReport', 'chartOrStaffReport'],
      'selected-sections': ['patientReport', 'collateralReport', 'chartOrStaffReport', 'riskAssessment', 'planFollowUpVerification'],
      'full-note': [
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
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'sparse-source-note',
    label: 'Sparse Source Note',
    noteTypeMatches: [/sparse source note/i, /limited source note/i],
    defaultScope: 'full-note',
    availableSections: [
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
    ],
    defaultSectionsByScope: {
      'hpi-only': ['sparseReasonLimitedSourceContext', 'sparseDocumentedFacts', 'patientReport', 'sourceLimitations'],
      'selected-sections': ['sparseDocumentedFacts', 'patientReport', 'riskAssessment', 'assessmentClinicalFormulation', 'sparsePlanNextSteps', 'sourceLimitations'],
      'full-note': [
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
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': true,
      'full-note': true,
    },
  },
  {
    id: 'outpatient-psych-follow-up',
    label: 'Outpatient Psych Follow-Up',
    noteTypeMatches: [/outpatient psych follow-up/i, /outpatient psych followup/i, /outpatient psychiatry follow-up/i, /outpatient psychiatric follow-up/i],
    defaultScope: 'full-note',
    availableSections: [
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
    ],
    defaultSectionsByScope: {
      'hpi-only': ['outpatientReasonFollowUpFocus', 'progressIntervalHistoryPatientReport', 'outpatientSymptomsFunctionalStatus'],
      'selected-sections': ['progressIntervalHistoryPatientReport', 'outpatientSymptomsFunctionalStatus', 'riskAssessment', 'outpatientMedicationsAdherenceSideEffects', 'assessmentClinicalFormulation', 'outpatientPlanFollowUp'],
      'full-note': [
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
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': true,
      'full-note': true,
    },
  },
  {
    id: 'medical-consult-note',
    label: 'Medical Consultation Note',
    noteTypeMatches: [/medical consultation note/i, /medical consult note/i, /medical consultation/i, /medical consult/i],
    defaultScope: 'full-note',
    availableSections: [
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
    ],
    defaultSectionsByScope: {
      'hpi-only': ['consultReasonForConsultation', 'consultQuestionClinicalConcern', 'consultRelevantHistoryHpi'],
      'selected-sections': ['consultQuestionClinicalConcern', 'consultPertinentExamObservations', 'consultAssessmentMedicalImpression', 'consultRecommendationsPlan', 'sourceLimitations'],
      'full-note': [
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
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': true,
      'full-note': true,
    },
  },
  {
    id: 'medical-h-and-p',
    label: 'Medical H&P',
    noteTypeMatches: [/medical h&p/i, /medical h and p/i, /medical history and physical/i],
    defaultScope: 'full-note',
    availableSections: [
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
    ],
    defaultSectionsByScope: {
      'hpi-only': ['medicalHpReasonAdmissionContext', 'medicalHpHistoryOfPresentIllness'],
      'selected-sections': ['medicalHpHistoryOfPresentIllness', 'medicalHpMedicationsAllergies', 'medicalHpPhysicalExamObservations', 'medicalHpAssessmentMedicalProblems', 'medicalHpPlanRecommendations'],
      'full-note': [
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
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': false,
    },
  },
  {
    id: 'psychiatry-follow-up',
    label: 'Psychiatry Follow-Up',
    noteTypeMatches: [
      /psychiatry follow-up/i,
      /psychiatry follow up/i,
      /psych follow-up/i,
      /outpatient psych follow-up/i,
    ],
    defaultScope: 'full-note',
    availableSections: [
      'chiefConcern',
      'intervalUpdate',
      'symptomReview',
      'medications',
      'mentalStatus',
      'safetyRisk',
      'assessment',
      'plan',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['intervalUpdate'],
      'selected-sections': ['intervalUpdate', 'assessment', 'plan'],
      'full-note': ['chiefConcern', 'symptomReview', 'medications', 'mentalStatus', 'safetyRisk', 'assessment', 'plan'],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'outpatient-psych-telehealth-follow-up',
    label: 'Outpatient Psych Telehealth Follow-Up',
    noteTypeMatches: [/outpatient psych telehealth follow-up/i, /telehealth psych follow-up/i],
    defaultScope: 'full-note',
    availableSections: [
      'chiefConcern',
      'intervalUpdate',
      'symptomReview',
      'medications',
      'mentalStatus',
      'safetyRisk',
      'assessment',
      'plan',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['intervalUpdate'],
      'selected-sections': ['intervalUpdate', 'assessment', 'plan'],
      'full-note': ['chiefConcern', 'intervalUpdate', 'symptomReview', 'medications', 'mentalStatus', 'safetyRisk', 'assessment', 'plan'],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'inpatient-psych-progress',
    label: 'Inpatient Psych Progress Note',
    noteTypeMatches: [/inpatient psych progress/i],
    defaultScope: 'full-note',
    availableSections: [
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
    ],
    defaultSectionsByScope: {
      'hpi-only': ['progressReasonIntervalConcern', 'progressIntervalHistoryPatientReport'],
      'selected-sections': ['progressIntervalHistoryPatientReport', 'progressStaffNursingCollateralObservations', 'assessmentClinicalFormulation', 'progressPlanContinuedHospitalization'],
      'full-note': [
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
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'outpatient-psych-evaluation',
    label: 'Outpatient Psychiatric Evaluation',
    noteTypeMatches: [/outpatient psychiatric evaluation/i, /outpatient psych evaluation/i],
    defaultScope: 'full-note',
    availableSections: [
      'chiefConcern',
      'psychHistory',
      'substanceHistory',
      'priorTreatment',
      'socialHistory',
      'familyHistory',
      'traumaHistory',
      'legalHistory',
      'medications',
      'mentalStatus',
      'strengthsLimitations',
      'diagnosis',
      'medicalDiagnosis',
      'safetyRisk',
      'assessment',
      'plan',
      'clinicalStatusComplexity',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['chiefConcern'],
      'selected-sections': ['chiefConcern', 'mentalStatus', 'assessment', 'plan'],
      'full-note': [
        'chiefConcern',
        'psychHistory',
        'substanceHistory',
        'priorTreatment',
        'socialHistory',
        'familyHistory',
        'traumaHistory',
        'legalHistory',
        'medications',
        'mentalStatus',
        'strengthsLimitations',
        'diagnosis',
        'medicalDiagnosis',
        'safetyRisk',
        'assessment',
        'plan',
        'clinicalStatusComplexity',
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'psych-initial-adult-eval',
    label: 'Psychiatric Initial Adult Eval / Admission',
    noteTypeMatches: [/initial adult eval/i, /adult evaluation/i],
    defaultScope: 'full-note',
    availableSections: [
      'chiefConcern',
      'psychHistory',
      'substanceHistory',
      'priorTreatment',
      'socialHistory',
      'familyHistory',
      'traumaHistory',
      'legalHistory',
      'medications',
      'constitutionalReview',
      'musculoskeletalExam',
      'mentalStatus',
      'strengthsLimitations',
      'diagnosis',
      'medicalDiagnosis',
      'safetyRisk',
      'assessment',
      'plan',
      'proposedDischarge',
      'hospitalizationJustification',
      'attestation',
      'clinicalStatusComplexity',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['chiefConcern'],
      'selected-sections': ['chiefConcern', 'mentalStatus', 'assessment', 'plan'],
      'full-note': [
        'chiefConcern',
        'psychHistory',
        'substanceHistory',
        'priorTreatment',
        'socialHistory',
        'familyHistory',
        'traumaHistory',
        'legalHistory',
        'medications',
        'constitutionalReview',
        'musculoskeletalExam',
        'mentalStatus',
        'strengthsLimitations',
        'diagnosis',
        'medicalDiagnosis',
        'safetyRisk',
        'assessment',
        'plan',
        'proposedDischarge',
        'hospitalizationJustification',
        'attestation',
        'clinicalStatusComplexity',
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
  {
    id: 'psych-initial-adolescent-eval',
    label: 'Psychiatric Initial Adolescent Eval / Admission',
    noteTypeMatches: [/initial adolescent eval/i, /child\/adolescent/i, /adolescent evaluation/i],
    defaultScope: 'full-note',
    availableSections: [
      'chiefConcern',
      'psychHistory',
      'substanceHistory',
      'priorTreatment',
      'socialHistory',
      'familyHistory',
      'developmentalEducationalHistory',
      'traumaHistory',
      'legalHistory',
      'medications',
      'constitutionalReview',
      'musculoskeletalExam',
      'mentalStatus',
      'strengthsLimitations',
      'diagnosis',
      'medicalDiagnosis',
      'safetyRisk',
      'plan',
      'proposedDischarge',
      'hospitalizationJustification',
      'attestation',
      'clinicalStatusComplexity',
    ],
    defaultSectionsByScope: {
      'hpi-only': ['chiefConcern'],
      'selected-sections': ['chiefConcern', 'mentalStatus', 'assessment', 'plan'],
      'full-note': [
        'chiefConcern',
        'psychHistory',
        'substanceHistory',
        'priorTreatment',
        'socialHistory',
        'familyHistory',
        'developmentalEducationalHistory',
        'traumaHistory',
        'legalHistory',
        'medications',
        'constitutionalReview',
        'musculoskeletalExam',
        'mentalStatus',
        'strengthsLimitations',
        'diagnosis',
        'medicalDiagnosis',
        'safetyRisk',
        'plan',
        'proposedDischarge',
        'hospitalizationJustification',
        'attestation',
        'clinicalStatusComplexity',
      ],
    },
    requiresStandaloneMseByScope: {
      'hpi-only': false,
      'selected-sections': false,
      'full-note': true,
    },
  },
];

export function resolveNoteProfile(noteType: string): NoteProfile | null {
  const normalized = noteType.trim();
  return NOTE_PROFILES.find((profile) => profile.noteTypeMatches.some((pattern) => pattern.test(normalized))) ?? null;
}

export function resolveRequestedScope(input?: string | null): OutputScope {
  if (input === 'hpi-only' || input === 'selected-sections' || input === 'full-note') {
    return input;
  }

  return 'full-note';
}

export function planSections(input: { noteType: string; requestedScope?: string | null; requestedSections?: string[] | null }) {
  const profile = resolveNoteProfile(input.noteType);
  const scope = resolveRequestedScope(input.requestedScope);

  if (!profile) {
    return {
      scope,
      profile: null,
      sections: [] as NoteSectionKey[],
      requiresStandaloneMse: false,
    };
  }

  const requestedSections = Array.isArray(input.requestedSections)
    ? input.requestedSections.filter((section): section is NoteSectionKey => profile.availableSections.includes(section as NoteSectionKey))
    : [];

  const sections = scope === 'selected-sections' && requestedSections.length
    ? requestedSections
    : profile.defaultSectionsByScope[scope];

  return {
    scope,
    profile,
    sections,
    requiresStandaloneMse: profile.requiresStandaloneMseByScope[scope] ?? false,
  };
}
