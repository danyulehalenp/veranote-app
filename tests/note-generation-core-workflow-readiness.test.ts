import { describe, expect, it } from 'vitest';

import { buildSourceInputFromSections } from '@/lib/ai/source-sections';
import { sourcePacketRegressionCases } from '@/lib/eval/note-generation/source-packet-regression';
import {
  FUTURE_EHR_WRITEBACK_CONTRACT,
  SOURCE_LANE_CONTRACTS,
  SOURCE_LANE_ORDER,
  buildEhrOutputReadiness,
} from '@/lib/note/source-lane-contract';
import { buildAtlasReviewItems } from '@/lib/veranote/atlas-review';
import { evaluatePostNoteCptRecommendations } from '@/lib/veranote/defensibility/cpt-support';

const CORE_NOTE_WORKFLOWS = [
  {
    label: 'inpatient psych evaluation',
    matches: (noteType: string) => /inpatient psych initial/i.test(noteType),
  },
  {
    label: 'inpatient psych follow-up',
    matches: (noteType: string) => /inpatient psych (?:progress|day two)/i.test(noteType),
  },
  {
    label: 'outpatient psych evaluation',
    matches: (noteType: string) => /outpatient psych(?:iatric)? evaluation/i.test(noteType),
  },
  {
    label: 'outpatient psych follow-up',
    matches: (noteType: string) => /outpatient psych (?:follow-up|telehealth follow-up)/i.test(noteType),
  },
] as const;

function sourceHasEveryLane(caseId: string) {
  const item = sourcePacketRegressionCases.find((candidate) => candidate.id === caseId);
  if (!item) return false;

  return SOURCE_LANE_ORDER.every((laneId) => Boolean(item.sourceSections[laneId]?.trim()));
}

describe('note generation core workflow readiness', () => {
  it('keeps the four core psych note workflows explicitly represented in the protected bank', () => {
    for (const workflow of CORE_NOTE_WORKFLOWS) {
      const matches = sourcePacketRegressionCases.filter((item) => workflow.matches(item.noteType));

      expect(matches.length, workflow.label).toBeGreaterThan(0);
      expect(matches.some((item) => SOURCE_LANE_ORDER.every((laneId) => item.sourceSections[laneId]?.trim())), workflow.label).toBe(true);
      expect(matches.some((item) => item.required.length >= 4 && item.forbidden.length >= 3), workflow.label).toBe(true);
    }

    expect(sourceHasEveryLane('ocr-er-referral-first-episode-psychosis-misspellings')).toBe(true);
    expect(sourceHasEveryLane('wellsky-inpatient-day-two-missing-mse-risk-details')).toBe(true);
    expect(sourceHasEveryLane('tebra-outpatient-eval-referral-history-not-confirmed')).toBe(true);
    expect(sourceHasEveryLane('typo-heavy-outpatient-followup-preserves-med-adherence-side-effect-nuance')).toBe(true);
  });

  it('keeps source packet lanes ready for pasted documents, typing, dictation, ambient transcript, and provider add-ons', () => {
    expect(SOURCE_LANE_ORDER).toEqual([
      'intakeCollateral',
      'clinicianNotes',
      'patientTranscript',
      'objectiveData',
    ]);

    expect(SOURCE_LANE_CONTRACTS.every((lane) => lane.acceptsDictation)).toBe(true);
    expect(SOURCE_LANE_CONTRACTS.filter((lane) => lane.defaultAmbientTarget).map((lane) => lane.id)).toEqual([
      'patientTranscript',
    ]);
    expect(SOURCE_LANE_CONTRACTS.find((lane) => lane.id === 'intakeCollateral')?.acceptsUploads).toBe(true);
    expect(SOURCE_LANE_CONTRACTS.find((lane) => lane.id === 'objectiveData')?.clinicalReliability).toBe('instructional-only');

    const sourcePacket = buildSourceInputFromSections({
      intakeCollateral: 'Reviewed ER packet: lithium level pending and nursing intake copied from EHR.',
      clinicianNotes: 'Provider typed or dictated: patient denies current SI but sleep remains poor.',
      patientTranscript: 'Ambient transcript: patient says, "I just want to leave."',
      objectiveData: 'Provider Add-On: use concise WellSky style; do not place CPT preference in note.',
    });

    expect(sourcePacket).toMatch(/Pre-Visit Data:\nReviewed ER packet/);
    expect(sourcePacket).toMatch(/Live Visit Notes:\nProvider typed or dictated/);
    expect(sourcePacket).toMatch(/Ambient Transcript:\nAmbient transcript/);
    expect(sourcePacket).toMatch(/Provider Add-On:\nProvider Add-On/);
    expect(sourcePacket.indexOf('Pre-Visit Data:')).toBeLessThan(sourcePacket.indexOf('Live Visit Notes:'));
    expect(sourcePacket.indexOf('Live Visit Notes:')).toBeLessThan(sourcePacket.indexOf('Ambient Transcript:'));
    expect(sourcePacket.indexOf('Ambient Transcript:')).toBeLessThan(sourcePacket.indexOf('Provider Add-On:'));
  });

  it('keeps post-generation review, export, and CPT support conservative after a note exists', () => {
    const atlasItems = buildAtlasReviewItems({
      contradictionFlags: ['Patient denies suicidal intent, but collateral reports goodbye texts and unsafe-if-discharged concern.'],
      copilotSuggestions: [
        {
          severity: 'review',
          title: 'MSE gap',
          detail: 'Thought process and insight are not clearly documented in the source packet.',
        },
      ],
      draftMseTermsNeedingReview: [
        {
          entry: {
            label: 'Thought process',
            domain: 'mse',
          },
        },
      ],
      encounterDocumentationChecks: [],
      highRiskWarnings: [
        {
          id: 'unsupported-reassurance',
          title: 'Unsupported reassurance',
          detail: 'No safety concerns wording would erase contradictory collateral risk information.',
        },
      ],
      medicationScaffoldWarnings: [],
      objectiveConflictBullets: ['UDS positive cocaine while patient denies cocaine use.'],
      phaseTwoTrustCues: [{ id: 'objective-conflict', label: 'Objective conflict', detail: 'Objective data conflicts with narrative.' }],
      reviewCounts: { needsReview: 2, unreviewed: 2 },
      destinationConstraintActive: true,
    });

    expect(atlasItems.some((item) => item.triggerId === 'risk_contradiction')).toBe(true);
    expect(atlasItems.some((item) => item.triggerId === 'unsupported_reassurance')).toBe(true);
    expect(atlasItems.some((item) => item.triggerId === 'missing_mse')).toBe(true);
    expect(atlasItems.every((item) => item.allowedActions.includes('ask_atlas'))).toBe(true);
    expect(atlasItems.some((item) => item.allowedActions.includes('show_source'))).toBe(true);

    const exportReadiness = buildEhrOutputReadiness('Tebra/Kareo', 'outpatient-follow-up');

    expect(exportReadiness.currentMode).toBe('copy_paste_export');
    expect(exportReadiness.directWritebackSupported).toBe(false);
    expect(exportReadiness.connectorPhase).toBe('future_connector_required');
    expect(exportReadiness.fieldTargets.map((target) => target.id)).toEqual(expect.arrayContaining([
      'tebra-subjective',
      'tebra-assessment',
      'tebra-plan',
    ]));
    expect(FUTURE_EHR_WRITEBACK_CONTRACT.notAllowedNow).toContain('Silent auto-insertion into an external EHR.');

    const cptSupport = evaluatePostNoteCptRecommendations({
      noteType: 'Outpatient Psych Follow-Up',
      completedNoteText: [
        'Interval update: anxiety remains impairing with avoidance of stores.',
        'Medication adherence and nausea side effects reviewed.',
        '20 minutes of CBT-oriented psychotherapy focused on reframing and exposure planning.',
        'Safety: patient denies SI/HI today.',
      ].join(' '),
      encounterSupport: {
        totalMinutes: '35',
        psychotherapyMinutes: '20',
      },
    });

    expect(cptSupport.summary).toMatch(/possible CPT-support candidate/i);
    expect(cptSupport.candidates.some((candidate) => candidate.family === 'Office / outpatient E/M family')).toBe(true);
    expect(cptSupport.candidates.some((candidate) => candidate.family === 'Psychotherapy add-on with E/M family')).toBe(true);
    expect(cptSupport.guardrails.join(' ')).toMatch(/not definitive billing recommendations/i);
    expect(JSON.stringify(cptSupport)).not.toMatch(/bill this code|guaranteed|meets criteria for/i);
  });

  it('keeps messy real-world inputs and provider prompt leakage scenarios in the protected bank', () => {
    const caseText = sourcePacketRegressionCases.map((item) => [
      item.id,
      item.title,
      item.ehr || '',
      item.customInstructions || '',
      item.sourceSections.intakeCollateral,
      item.sourceSections.clinicianNotes,
      item.sourceSections.patientTranscript,
      item.sourceSections.objectiveData,
      item.forbidden.map((rule) => rule.label).join(' '),
    ].join('\n')).join('\n\n');

    expect(caseText).toMatch(/OCR|reviewed document|pdf|scanned/i);
    expect(caseText).toMatch(/sertrline|anxity|qick|exposre|Lamictle/i);
    expect(caseText).toMatch(/Ambient transcript/i);
    expect(caseText).toMatch(/Provider Add-On/i);
    expect(caseText).toMatch(/CPT preference|billing code/i);
    expect(caseText).toMatch(/WellSky|Tebra\/Kareo|ICANotes|TherapyNotes|SimplePractice/i);
    expect(caseText).toMatch(/do not diagnose|not confirmed|uncertain|pending/i);
  });
});
