import { describe, expect, it } from 'vitest';
import { buildClinicalTaskPriorityPayload } from '@/lib/veranote/assistant-clinical-task';
import type { ContradictionAnalysis } from '@/lib/veranote/assistant-contradiction-detector';
import type { RiskAnalysis } from '@/lib/veranote/assistant-risk-detector';
import type { LevelOfCareAssessment, LosAssessment, MedicalNecessityAssessment } from '@/lib/veranote/defensibility/defensibility-types';
import type { DischargeStatus, TriageSuggestion } from '@/lib/veranote/workflow/workflow-types';

function makeRiskAnalysis(overrides?: Partial<RiskAnalysis>): RiskAnalysis {
  return {
    suicide: [],
    violence: [],
    graveDisability: [],
    generalWarnings: ['Risk requires source-bound wording.'],
    level: 'unclear',
    ...overrides,
  };
}

function makeContradictions(overrides?: Partial<ContradictionAnalysis>): ContradictionAnalysis {
  return {
    contradictions: [],
    severityLevel: 'none',
    ...overrides,
  };
}

function makeMedicalNecessity(overrides?: Partial<MedicalNecessityAssessment>): MedicalNecessityAssessment {
  return {
    signals: [],
    missingElements: [],
    ...overrides,
  };
}

function makeLevelOfCare(overrides?: Partial<LevelOfCareAssessment>): LevelOfCareAssessment {
  return {
    suggestedLevel: 'unclear',
    justification: [],
    missingJustification: [],
    ...overrides,
  };
}

function makeLos(overrides?: Partial<LosAssessment>): LosAssessment {
  return {
    reasonsForContinuedStay: [],
    barriersToDischarge: [],
    stabilityIndicators: [],
    missingDischargeCriteria: [],
    ...overrides,
  };
}

function makeDischarge(overrides?: Partial<DischargeStatus>): DischargeStatus {
  return {
    readiness: 'unclear',
    supportingFactors: [],
    barriers: [],
    ...overrides,
  };
}

function makeTriage(overrides?: Partial<TriageSuggestion>): TriageSuggestion {
  return {
    level: 'unclear',
    reasoning: ['Clarify the unresolved high-acuity facts before cleaning up the note.'],
    confidence: 'low',
    ...overrides,
  };
}

describe('assistant clinical task response shaping', () => {
  it('returns concrete discharge blockers for suicide-risk contradiction follow-ups', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'That answer is still soft. She also wants to leave, says she can "probably be safe," and refuses to let me call her sister back. Tell me what actually blocks discharge here.',
      sourceText: 'Patient denies SI right now, but last night she texted her sister goodbye, bought fentanyl two days ago, and said, "I do not trust myself tonight."',
      currentDraftText: 'Draft says risk is low and discharge can be considered.',
      riskAnalysis: makeRiskAnalysis({ level: 'clear_high' }),
      contradictionAnalysis: makeContradictions({
        contradictions: [{ label: 'Suicide denial conflicts with plan', detail: 'Denial conflicts with higher-risk suicide facts.', severity: 'high' }],
        severityLevel: 'high',
      }),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('Discharge is blocked');
    expect(payload?.message).toContain('collateral clarification is being refused');
    expect(payload?.message).toContain('suicide-risk contradiction remains unresolved');
  });

  it('returns clinical schizophrenia warning language instead of product meta copy', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'If somebody insists on documenting schizophrenia here, what exact warning should Vera give instead of sounding agreeable?',
      sourceText: 'Patient is paranoid, has not slept in three days, UDS is positive for meth and THC, and UPT is negative.',
      currentDraftText: 'Draft says primary psychosis is likely.',
      riskAnalysis: makeRiskAnalysis(),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('Do not upgrade this to schizophrenia');
    expect(payload?.message).not.toContain('Provider profiles exist');
  });

  it('keeps telehealth observation limits explicit in wording requests', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'Now tell me what Vera should refuse to imply in a telehealth psych follow-up when the patient keeps the camera off and most findings are self-report only.',
      sourceText: 'Source gives chronic passive SI, poor sleep, missed doses, recent breakup, and the camera was off most of the visit.',
      currentDraftText: 'Draft says stable and doing better.',
      riskAnalysis: makeRiskAnalysis({ level: 'possible_high' }),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('Camera-off telehealth with mostly self-report leaves major limits on direct observation');
    expect(payload?.suggestions?.some((item) => item.includes('camera-off telehealth follow-up'))).toBe(true);
  });

  it('surfaces intoxication and decisional-capacity danger in AMA scenarios', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'If Vera sounds agreeable and writes a tidy capacity sentence here, what exactly has it ignored?',
      sourceText: 'BAL 0.24, inconsistent story, possible head injury, and cannot repeat alternatives back.',
      currentDraftText: 'Draft says patient prefers discharge AMA.',
      riskAnalysis: makeRiskAnalysis(),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('decisional capacity');
    expect(payload?.message).toContain('intoxication');
    expect(payload?.suggestions?.some((item) => item.includes('understanding, appreciation, reasoning'))).toBe(true);
  });

  it('distinguishes the clean AMA problem explanation from the ignored-factors follow-up', () => {
    const commonInput = {
      sourceText: 'BAL 0.24, inconsistent story, possible head injury, and cannot repeat alternatives back.',
      currentDraftText: 'Draft says patient prefers discharge AMA.',
      riskAnalysis: makeRiskAnalysis(),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    };

    const problemPayload = buildClinicalTaskPriorityPayload({
      message: 'Do not let Vera hand-wave capacity here. BAL 0.24, inconsistent story, possible head injury, and cannot repeat alternatives back. Why is a clean AMA note a problem?',
      ...commonInput,
    });

    const ignoredPayload = buildClinicalTaskPriorityPayload({
      message: 'If Vera sounds agreeable and writes a tidy capacity sentence here, what exactly has it ignored?',
      ...commonInput,
    });

    expect(problemPayload?.message).toContain('A clean AMA or capacity sentence would be unsafe here');
    expect(ignoredPayload?.message).toContain('It has ignored decisional capacity');
    expect(ignoredPayload?.message).toContain('BAL 0.24 is documented');
    expect(ignoredPayload?.message).not.toBe(problemPayload?.message);
  });

  it('returns chart-ready violence documentation wording for documentation-language follow-ups', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'That is still too vague. I need documentation language that keeps denial, observed agitation, and collateral threat history all visible at the same time.',
      sourceText: 'Patient denies HI, staff documented pacing and jaw clenching, and collateral says he threatened the neighbor yesterday.',
      currentDraftText: 'Draft says violence risk low because patient denies intent.',
      riskAnalysis: makeRiskAnalysis({ level: 'possible_high' }),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('Chart-ready wording:');
    expect(payload?.message).toContain('staff-documented pacing');
    expect(payload?.message).toContain('Patient denial of homicidal intent should stay visible');
  });

  it('keeps medical delirium explicit instead of allowing primary psychosis cleanup', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'Tell me what needs to stay in the assessment to keep delirium on the table instead of letting psych language take over.',
      sourceText: 'Fever, fluctuating attention, visual hallucinations, UTI, and confusion starting yesterday are documented.',
      currentDraftText: 'Draft leans toward schizophrenia relapse.',
      riskAnalysis: makeRiskAnalysis(),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('Chart-ready wording');
    expect(payload?.message).toContain('Delirium or another medical etiology has to stay on the table');
    expect(payload?.suggestions?.some((item) => item.includes('medical etiology'))).toBe(true);
  });

  it('keeps withdrawal and toxicity danger from being buried under psych framing', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'If Vera keeps this in a routine outpatient-psych lane, what is the failure?',
      sourceText: 'Tremor, GI symptoms, ataxia, confusion, dehydration, and a recent lithium increase should make Vera very nervous.',
      currentDraftText: 'Draft frames this as anxious after a medication change.',
      riskAnalysis: makeRiskAnalysis(),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('unsafe');
    expect(payload?.message).toContain('toxicity');
    expect(payload?.suggestions?.some((item) => item.includes('routine outpatient-psych'))).toBe(false);
    expect(payload?.suggestions?.some((item) => item.includes('Do not flatten tremor'))).toBe(true);
  });

  it('returns contradiction-specific violence wording instead of generic fallback text', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'Do not give me a sanitized violence-risk answer. The patient denies HI, but staff documented pacing, jaw clenching, "they are going to make me snap," and the brother says he threatened the neighbor yesterday. What does Vera do with that contradiction?',
      sourceText: 'Patient denies HI, staff documented pacing and jaw clenching, and collateral says he threatened the neighbor yesterday.',
      currentDraftText: 'Draft says violence risk low because patient denies intent.',
      riskAnalysis: makeRiskAnalysis({ level: 'possible_high' }),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('Vera should document the contradiction side by side');
    expect(payload?.message).toContain('keep explicit the denial alongside observed agitation and collateral threat history');
    expect(payload?.message).toContain('Violence risk remains conflicted');
  });

  it('returns honest discharge plan language for unresolved discharge pressure cases', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'If Vera tries to sound helpful by making the plan cleaner than the source, that is a failure. Tell me the exact plan language that stays honest here.',
      sourceText: 'Patient is labile, intermittently refusing meds, mother will not take him home, and he keeps saying he does not care what happens.',
      currentDraftText: 'Draft says discharge tomorrow may be reasonable.',
      riskAnalysis: makeRiskAnalysis({ level: 'possible_high' }),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('Honest plan language:');
    expect(payload?.message).toContain('safe discharge planning is not established');
    expect(payload?.message).toContain('treatment engagement and medication adherence remain unstable');
  });

  it('returns discharge blockers instead of quoted plan language when asked what stays unresolved', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'Do not give me policy fluff. Tell me what has to stay unresolved in the plan if the chart is still this shaky and someone is pushing me to write a premature discharge note.',
      sourceText: 'Patient is labile, intermittently refusing meds, mother will not take him home, and he keeps saying he does not care what happens.',
      currentDraftText: 'Draft says discharge tomorrow may be reasonable.',
      riskAnalysis: makeRiskAnalysis({ level: 'possible_high' }),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('Discharge is blocked by');
    expect(payload?.message).not.toContain('Honest plan language:');
  });

  it('keeps postpartum psychosis risk language explicit', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'Do not trivialize this into new-parent stress. Ten days postpartum, no sleep for 72 hours, religious delusions about the baby, and bizarre behavior is not just anxiety. What has to stay explicit?',
      sourceText: 'Ten days postpartum, no sleep for 72 hours, religious delusions about the baby, and bizarre behavior are documented.',
      currentDraftText: 'Draft says postpartum anxiety and sleep deprivation.',
      riskAnalysis: makeRiskAnalysis(),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('the postpartum timing, severe sleep loss, psychotic symptoms, and bizarre behavior');
    expect(payload?.message).toContain('Postpartum psychosis or another acute postpartum syndrome must stay explicit');
  });

  it('keeps adolescent patient report and unreliable caregiver collateral side by side', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'I want documentation language that keeps patient report, physical findings, and unreliable caregiver collateral all visible at the same time.',
      sourceText: 'Teen talked about disappearing, there are possible strangulation marks, and the caregiver is minimizing.',
      currentDraftText: 'Draft sounds calmer because the parent says things are fine.',
      riskAnalysis: makeRiskAnalysis({ level: 'possible_high' }),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('Chart-ready wording:');
    expect(payload?.message).toContain('Patient report, physical findings, and unreliable or minimizing caregiver collateral should remain side by side');
    expect(payload?.message).toContain('unreliable or minimizing caregiver collateral');
  });

  it('avoids low-risk phrasing in telehealth camera-off answers', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'Now tell me what Vera should refuse to imply in a telehealth psych follow-up when the patient keeps the camera off and most findings are self-report only.',
      sourceText: 'Source gives chronic passive SI, poor sleep, missed doses, recent breakup, and the camera was off most of the visit.',
      currentDraftText: 'Draft says stable and doing better.',
      riskAnalysis: makeRiskAnalysis({ level: 'possible_high' }),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('should not convert partial observation or "no current plan" alone');
    expect(payload?.message).not.toContain('unstable engagement and intermittent medication refusal');
  });

  it('routes withdrawal-versus-panic prompts into clinical unsafe-explanation logic', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'This is the kind of sloppy note that gets people hurt. Heavy daily alcohol use, missed clonazepam for three days, tremor, sweating, vomiting, tachycardia, and visual shadows overnight. Why would Vera let anyone settle on "panic attack likely"?',
      sourceText: 'Draft says panic attack likely. Source mentions tremor, diaphoresis, tachycardia, vomiting, heavy daily alcohol use, missed clonazepam for three days, and visual shadows overnight.',
      currentDraftText: 'Draft says panic attack likely.',
      riskAnalysis: makeRiskAnalysis(),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.message).toContain('Calling this panic likely would be unsafe here');
    expect(payload?.message).toContain('withdrawal or medical-danger signals');
  });

  it('returns direct MSE completion limits for missing-domain prompts', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'The source only says mood anxious, slept poorly, and was late to telehealth. What should Vera refuse to auto-complete in the MSE?',
      sourceText: 'Mood anxious. Slept poorly. Late to telehealth.',
      currentDraftText: 'Draft tries to fill a complete normal MSE.',
      riskAnalysis: makeRiskAnalysis(),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.answerMode).toBe('mse_completion_limits');
    expect(payload?.message).toContain('Documented: mood');
    expect(payload?.message).toContain('Leave unfilled: appearance');
    expect(payload?.message).toContain('Do not auto-complete missing domains');
    expect(payload?.message).not.toContain('telehealth automatically changes');
  });

  it('returns direct MSE completion limits for partial-domain prompts', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'Source only gives pressured speech, tangential thought process, and anxious mood. What should Vera leave unfilled in the MSE instead of auto-completing normals?',
      sourceText: 'Speech pressured. Thought process tangential. Mood anxious.',
      currentDraftText: 'Draft tries to fill in normal perception and judgment.',
      riskAnalysis: makeRiskAnalysis(),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.answerMode).toBe('mse_completion_limits');
    expect(payload?.message).toContain('speech');
    expect(payload?.message).toContain('thought process');
    expect(payload?.message).toContain('Leave unfilled');
    expect(payload?.message).not.toBe("No, but I'll find out how I can learn how to.");
  });

  it('preserves uncertainty for unknown-substance documentation prompts', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'UDS is negative. Patient says she took an unknown blue powder from a friend and now is confused, sweaty, and pacing. How should Vera document substance involvement without pretending she knows what it was?',
      sourceText: 'Negative UDS. Patient says a friend gave her an unknown blue powder. She is confused, sweaty, and pacing.',
      currentDraftText: 'Draft tries to name the substance.',
      riskAnalysis: makeRiskAnalysis(),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.answerMode).toBe('uncertainty_preserving_substance_documentation');
    expect(payload?.message).toContain('unknown');
    expect(payload?.message).toContain('Negative UDS does not exclude substance involvement');
    expect(payload?.message).toContain('Do not infer an exact compound');
    expect(payload?.message).not.toContain('Eating disorder');
  });

  it('forces warning-language responses for what-not-to-imply prompts', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'Now tell me what Vera should refuse to imply in a telehealth psych follow-up when the patient keeps the camera off and most findings are self-report only.',
      sourceText: 'Source gives chronic passive SI, poor sleep, missed doses, recent breakup, and the camera was off most of the visit.',
      currentDraftText: 'Draft says stable and doing better.',
      riskAnalysis: makeRiskAnalysis({ level: 'possible_high' }),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.answerMode).toBe('warning_language');
    expect(payload?.message).toContain('Warning: Do not imply stable presentation');
    expect(payload?.message).toContain('Camera-off telehealth with mostly self-report leaves major limits on direct observation');
  });

  it('forces chart-ready wording responses for documentation-language prompts', () => {
    const payload = buildClinicalTaskPriorityPayload({
      message: 'That is still too vague. I need documentation language that keeps denial, observed agitation, and collateral threat history all visible at the same time.',
      sourceText: 'Patient denies HI, staff documented pacing and jaw clenching, and collateral says he threatened the neighbor yesterday.',
      currentDraftText: 'Draft says violence risk low because patient denies intent.',
      riskAnalysis: makeRiskAnalysis({ level: 'possible_high' }),
      contradictionAnalysis: makeContradictions(),
      medicalNecessity: makeMedicalNecessity(),
      levelOfCare: makeLevelOfCare(),
      losAssessment: makeLos(),
      dischargeStatus: makeDischarge(),
      triageSuggestion: makeTriage(),
    });

    expect(payload?.answerMode).toBe('chart_ready_wording');
    expect(payload?.message).toContain('Chart-ready wording:');
    expect(payload?.message).toContain('Violence risk remains conflicted');
  });
});
