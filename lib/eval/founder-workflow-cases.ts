import { buildFounderWorkflowSourceInput } from '@/lib/constants/founder-workflows';
import { founderWorkflowStarters } from '@/lib/constants/founder-workflows';
import type { FidelityCase } from '@/lib/eval/fidelity-cases';

export const founderWorkflowEvalCases: FidelityCase[] = founderWorkflowStarters.map((starter) => {
  switch (starter.id) {
    case 'psych-discharge':
      return {
        id: 'fw-psych-discharge',
        specialty: 'Psychiatry',
        noteType: starter.noteType,
        title: 'Founder workflow - psych discharge chronology',
        riskFocus: 'Discharge chronology, partial improvement, regimen invention, current-vs-earlier symptom drift',
        productSurface: 'Discharge review chronology',
        nextBuildFocus: 'Tighten discharge-specific review cues, current-vs-earlier symptom protection, and medication-detail missingness warnings.',
        rubricEmphasis: ['timelineFidelity', 'medicationFidelity', 'missingDataBehavior', 'factGrounding'],
        reviewPrompts: [
          'Check whether discharge wording quietly back-projects current status across the entire hospitalization.',
          'Penalize medication fidelity if the note invents a discharge regimen or makes regimen detail look more complete than the packet.',
          'Reward missing-data behavior when the note leaves thin discharge details visibly thin instead of polishing them into certainty.',
        ],
        sourceInput: buildFounderWorkflowSourceInput(starter),
        expectedTruths: [
          'Admission symptoms, hospital course, recent events, and current discharge status should stay separate.',
          'Improvement can be partial without implying full remission.',
          'Discharge medication wording should stay literal to the source packet.',
          'Follow-up planning should remain continuity-focused and source-faithful.',
        ],
        forbiddenAdditions: [
          'A fully specified discharge regimen if the source only says meds were adjusted.',
          'Language that implies symptoms were absent for the entire hospitalization.',
          'A stronger disposition or readiness statement than the source supports.',
        ],
        knownAmbiguities: [
          'Whether the patient is fully stable versus improved enough for discharge.',
          'Whether the exact discharge regimen is fully documented.',
          'How much recent versus current symptom burden remains.',
        ],
      };
    case 'acute-psych-admission':
      return {
        id: 'fw-acute-psych-admission',
        specialty: 'Psychiatry',
        noteType: starter.noteType,
        title: 'Founder workflow - acute psych admission framing',
        riskFocus: 'Messy chronology, collateral conflict, uncertainty preservation, early risk framing',
        productSurface: 'Admission source reconciliation',
        nextBuildFocus: 'Improve collateral conflict visibility, attribution labeling, and uncertainty-preserving intake-to-review guidance.',
        rubricEmphasis: ['timelineFidelity', 'attributionFidelity', 'contradictionHandling', 'missingDataBehavior'],
        reviewPrompts: [
          'Score attribution fidelity hard when patient report, collateral, and chart context get blurred together.',
          'Reward contradiction handling when the note leaves disagreement visible instead of choosing a winner without support.',
          'Penalize false certainty if the admission narrative becomes too smooth or too resolved for the actual source.',
        ],
        sourceInput: buildFounderWorkflowSourceInput(starter),
        expectedTruths: [
          'The note should preserve fragmented chronology rather than flatten it into false certainty.',
          'Collateral conflict should remain visible when sources disagree.',
          'Admission-level uncertainty should stay explicit instead of being polished away.',
          'Risk language should stay literal to the source.',
        ],
        forbiddenAdditions: [
          'A clean resolved chronology when the source is fragmented.',
          'Confident diagnoses or symptom conclusions not actually supported by the input.',
          'Attribution errors between patient report, collateral, and chart context.',
        ],
        knownAmbiguities: [
          'Which source is most accurate when accounts conflict.',
          'What diagnosis is most appropriate at the point of admission.',
          'What timeline details remain uncertain or incomplete.',
        ],
      };
    case 'psych-progress':
      return {
        id: 'fw-psych-progress',
        specialty: 'Psychiatry',
        noteType: starter.noteType,
        title: 'Founder workflow - daily psych progress literalism',
        riskFocus: 'Improvement overstatement, PRN/lab fidelity, unresolved-symptom visibility',
        productSurface: 'Daily progress trust layer',
        nextBuildFocus: 'Refine progress-note review prompts so symptom improvement, PRNs, and objective support stay literal rather than smoothed over.',
        rubricEmphasis: ['factGrounding', 'medicationFidelity', 'timelineFidelity', 'templateUsefulness'],
        reviewPrompts: [
          'Watch for progress-note prose that sounds cleaner by overstating improvement or implying more resolution than the day supports.',
          'Score medication fidelity against PRNs, labs, and objective support, not just whether med names appear.',
          'Template usefulness should only score high if the note stays clinically usable without burying unresolved symptoms.',
        ],
        sourceInput: buildFounderWorkflowSourceInput(starter),
        expectedTruths: [
          'Daily progress should remain literal about symptoms, PRNs, and treatment response.',
          'Unresolved symptoms should stay visible even when the prose is cleaner.',
          'Medication and lab context should not be invented or normalized.',
        ],
        forbiddenAdditions: [
          'A stronger improvement story than the day actually supports.',
          'Objective findings, PRN details, or lab interpretation that are not in source.',
          'A fake sense that risk or symptoms are fully resolved.',
        ],
        knownAmbiguities: [
          'How much improvement is clinically meaningful versus partial.',
          'Which med or lab changes actually drove the current presentation.',
        ],
      };
    case 'meds-labs-review':
    default:
      return {
        id: 'fw-meds-labs-review',
        specialty: 'Psychiatry',
        noteType: starter.noteType,
        title: 'Founder workflow - meds labs diagnosis review',
        riskFocus: 'Medication fidelity, lab-sensitive interpretation, diagnosis certainty creep',
        productSurface: 'Medication / labs fidelity',
        nextBuildFocus: 'Strengthen literal med/lab review cues and protect diagnostic uncertainty when data is thin or conflicting.',
        rubricEmphasis: ['medicationFidelity', 'factGrounding', 'missingDataBehavior', 'contradictionHandling'],
        reviewPrompts: [
          'Medication fidelity should stay strict: exact names, doses, changes, and lab context matter more than pretty synthesis.',
          'Penalize diagnosis certainty creep if the note sounds more settled than the available med/lab evidence allows.',
          'Reward missing-data behavior when the note preserves uncertainty around diagnosis, causality, or regimen details.',
        ],
        sourceInput: buildFounderWorkflowSourceInput(starter),
        expectedTruths: [
          'Medication names, doses, and recent changes should stay exact.',
          'Lab and EKG context should remain literal and source-grounded.',
          'Diagnostic framing should preserve uncertainty where the source is incomplete.',
        ],
        forbiddenAdditions: [
          'A precise regimen or diagnosis confidence not supported by the input.',
          'Invented side effects, response patterns, or lab abnormalities.',
          'A cleaned-up medication story that quietly reconciles conflicting source details.',
        ],
        knownAmbiguities: [
          'Whether the current diagnosis is settled or still provisional.',
          'Whether the med effect is causal, partial, or unclear.',
          'Which lab findings are clinically decisive versus contextual.',
        ],
      };
  }
});
