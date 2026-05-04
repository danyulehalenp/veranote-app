import { describe, expect, it } from 'vitest';

import { buildSourceInputFromSections, describePopulatedSourceSections } from '@/lib/ai/source-sections';
import {
  FUTURE_EHR_WRITEBACK_CONTRACT,
  SOURCE_LANE_CONTRACTS,
  SOURCE_LANE_ORDER,
  buildEhrOutputReadiness,
  getSourceLaneContract,
} from '@/lib/note/source-lane-contract';
import { OUTPUT_DESTINATIONS, OUTPUT_NOTE_FOCUSES } from '@/lib/veranote/output-destinations';

describe('source lane and EHR output contract', () => {
  it('keeps the four provider-facing source lanes in the same order as note generation', () => {
    expect(SOURCE_LANE_ORDER).toEqual([
      'intakeCollateral',
      'clinicianNotes',
      'patientTranscript',
      'objectiveData',
    ]);

    const sourceInput = buildSourceInputFromSections({
      intakeCollateral: 'ER packet and labs.',
      clinicianNotes: 'Provider typed during visit.',
      patientTranscript: 'Ambient reviewed transcript.',
      objectiveData: 'Named prompt and output preferences.',
    });

    expect(sourceInput).toContain('Pre-Visit Data:\nER packet and labs.');
    expect(sourceInput).toContain('Live Visit Notes:\nProvider typed during visit.');
    expect(sourceInput).toContain('Ambient Transcript:\nAmbient reviewed transcript.');
    expect(sourceInput).toContain('Provider Add-On:\nNamed prompt and output preferences.');
    expect(describePopulatedSourceSections({
      intakeCollateral: 'x',
      clinicianNotes: 'x',
      patientTranscript: 'x',
      objectiveData: 'x',
    })).toEqual([
      'Pre-visit data',
      'Live visit notes',
      'Ambient transcript',
      'Provider add-on',
    ]);
  });

  it('documents Provider Add-On as an instruction lane, not a patient fact lane', () => {
    const addOn = getSourceLaneContract('objectiveData');

    expect(addOn?.clinicalReliability).toBe('instructional-only');
    expect(addOn?.generationRole).toMatch(/not as patient-reported history/i);
    expect(addOn?.finalNoteRule).toMatch(/Do not echo raw prompt names/i);
    expect(addOn?.acceptsDictation).toBe(true);
  });

  it('allows dictation in every source lane and ambient listening by default only in the ambient lane', () => {
    expect(SOURCE_LANE_CONTRACTS.every((lane) => lane.acceptsDictation)).toBe(true);
    expect(SOURCE_LANE_CONTRACTS.filter((lane) => lane.defaultAmbientTarget).map((lane) => lane.id)).toEqual([
      'patientTranscript',
    ]);
  });

  it('keeps direct EHR writeback as a future connector constraint instead of current behavior', () => {
    expect(FUTURE_EHR_WRITEBACK_CONTRACT.notImplementedYet).toBe(true);
    expect(FUTURE_EHR_WRITEBACK_CONTRACT.currentMode).toBe('copy_paste_export_only');
    expect(FUTURE_EHR_WRITEBACK_CONTRACT.notAllowedNow).toContain('Silent auto-insertion into an external EHR.');
  });

  it('keeps named EHR destinations section-addressable for future connectors', () => {
    expect(OUTPUT_DESTINATIONS).toEqual(expect.arrayContaining([
      'Epic',
      'Oracle Health/Cerner',
      'athenaOne',
      'eClinicalWorks',
      'AdvancedMD',
      'DrChrono',
      'Netsmart myAvatar',
      'Qualifacts/CareLogic',
      'Credible',
    ]));

    for (const destination of OUTPUT_DESTINATIONS.filter((item) => item !== 'Generic')) {
      const readiness = buildEhrOutputReadiness(destination, 'outpatient-follow-up');

      expect(readiness.currentMode).toBe('copy_paste_export');
      expect(readiness.directWritebackSupported).toBe(false);
      expect(readiness.wholeNoteCopySupported).toBe(true);
      expect(readiness.fieldLevelCopySupported).toBe(true);
      expect(readiness.fieldTargets.length, destination).toBeGreaterThan(0);
      expect(readiness.fieldTargets.every((target) => target.id && target.label && target.aliases.length && target.note)).toBe(true);
    }
  });

  it('supports every note focus without implying certified EHR integration', () => {
    for (const noteFocus of OUTPUT_NOTE_FOCUSES) {
      const readiness = buildEhrOutputReadiness('Tebra/Kareo', noteFocus);
      expect(readiness.noteFocus).toBe(noteFocus);
      expect(readiness.connectorPhase).toBe('future_connector_required');
      expect(readiness.guardrails.join(' ')).toMatch(/direct EHR writeback as future connector work/i);
    }
  });
});
