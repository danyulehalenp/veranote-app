import { describe, expect, it } from 'vitest';

import { sourcePacketRegressionCases } from '@/lib/eval/note-generation/source-packet-regression';
import {
  EHR_COPY_PASTE_FORMATTING_CONTRACT,
  buildEhrOutputReadiness,
} from '@/lib/note/source-lane-contract';
import {
  OUTPUT_DESTINATIONS,
  OUTPUT_NOTE_FOCUSES,
  formatTextForOutputDestination,
  getOutputDestinationFieldTargets,
  getOutputDestinationMeta,
} from '@/lib/veranote/output-destinations';

describe('note generation EHR and workflow coverage', () => {
  it('keeps source-packet regression broad enough for psych, therapy, medical, and EHR-ready workflows', () => {
    expect(sourcePacketRegressionCases.length).toBeGreaterThanOrEqual(25);

    const noteTypes = Array.from(new Set(sourcePacketRegressionCases.map((item) => item.noteType)));
    expect(noteTypes).toEqual(expect.arrayContaining([
      'Inpatient Psych Initial Adult Evaluation',
      'Inpatient Psych Progress Note',
      'Outpatient Psych Follow-Up',
      'Outpatient Psychiatric Evaluation',
      'Therapy Progress Note',
      'Psych Admission Medical H&P',
      'Medical Consultation Note',
    ]));

    const specialties = Array.from(new Set(sourcePacketRegressionCases.map((item) => item.specialty || 'Psychiatry')));
    expect(specialties).toEqual(expect.arrayContaining([
      'Psychiatry',
      'Therapy',
      'Hospital Medicine',
      'Internal Medicine',
      'Social Work',
      'Addiction Medicine',
    ]));
  });

  it('keeps named EHR destinations represented without claiming direct EHR writeback', () => {
    const destinations = Array.from(new Set(sourcePacketRegressionCases.map((item) => item.ehr).filter(Boolean)));

    expect(destinations).toEqual(expect.arrayContaining([
      'WellSky',
      'Tebra/Kareo',
      'SimplePractice',
      'TherapyNotes',
      'Valant',
      'ICANotes',
      'TheraNest',
      'Sessions Health',
      'Epic',
      'Oracle Health/Cerner',
      'athenaOne',
    ]));

    const destinationCases = sourcePacketRegressionCases.filter((item) => item.ehr && item.ehr !== 'Generic');
    expect(destinationCases.length).toBeGreaterThanOrEqual(12);
    expect(destinationCases.every((item) => !/direct writeback|auto[-\s]?insert|seamless insertion/i.test(item.customInstructions || ''))).toBe(true);
  });

  it('keeps every named EHR profile copy-paste only and field-addressable across note focuses', () => {
    expect(EHR_COPY_PASTE_FORMATTING_CONTRACT.currentMode).toBe('copy_paste_export_only');
    expect(EHR_COPY_PASTE_FORMATTING_CONTRACT.directWritebackSupported).toBe(false);

    for (const destination of OUTPUT_DESTINATIONS.filter((item) => item !== 'Generic')) {
      for (const noteFocus of OUTPUT_NOTE_FOCUSES) {
        const readiness = buildEhrOutputReadiness(destination, noteFocus);
        const ids = readiness.fieldTargets.map((target) => target.id);
        const targetText = readiness.fieldTargets.map((target) => [
          target.id,
          target.label,
          target.aliases.join(' '),
          target.note,
        ].join(' ')).join(' ');

        expect(readiness.currentMode, `${destination} ${noteFocus}`).toBe('copy_paste_export');
        expect(readiness.directWritebackSupported, `${destination} ${noteFocus}`).toBe(false);
        expect(readiness.connectorPhase, `${destination} ${noteFocus}`).toBe('future_connector_required');
        expect(new Set(ids).size, `${destination} ${noteFocus}`).toBe(ids.length);
        expect(readiness.fieldTargets.length, `${destination} ${noteFocus}`).toBeGreaterThan(0);
        expect(targetText, `${destination} ${noteFocus}`).not.toMatch(/\b(auto[-\s]?insert|silent insertion|seamless insertion|certified integration)\b/i);
      }
    }
  });

  it('keeps EHR copy-paste profiles clinically useful without pretending to be connectors', () => {
    for (const destination of OUTPUT_DESTINATIONS.filter((item) => item !== 'Generic')) {
      const meta = getOutputDestinationMeta(destination);
      const readiness = buildEhrOutputReadiness(destination, 'outpatient-follow-up');
      const labelsAndAliases = readiness.fieldTargets.map((target) => [
        target.label,
        target.aliases.join(' '),
      ].join(' ')).join(' ');

      expect(meta.pasteExpectation, destination).toMatch(/paste|paragraph|template|field|note/i);
      expect(readiness.guardrails.join(' '), destination).toMatch(/future connector work/i);
      expect(labelsAndAliases, destination).toMatch(/hpi|history|subjective|narrative|reason|interval/i);
      expect(labelsAndAliases, destination).toMatch(/plan|follow-up|medication|intervention|service plan|proposed discharge/i);
    }
  });

  it('keeps strict and sectioned EHR copy packs paste-safe and field-addressable', () => {
    const draft = [
      'HPI:',
      'Patient states “better”—but still anxious.',
      '',
      'Plan:',
      '• Continue source-supported plan.',
      '1. Follow up after labs return.',
    ].join('\n');

    const wellskyText = formatTextForOutputDestination({
      text: draft,
      destination: 'WellSky',
    });

    expect(wellskyText).toContain('"better"-but still anxious.');
    expect(wellskyText).toContain('- Continue source-supported plan.');
    expect(wellskyText).toContain('- Follow up after labs return.');
    expect(wellskyText).not.toMatch(/[“”–—•]/);

    const tebraProgressTargets = getOutputDestinationFieldTargets('Tebra/Kareo', 'inpatient-psych-follow-up');
    expect(tebraProgressTargets.map((target) => target.id)).toEqual(expect.arrayContaining([
      'tebra-psych-progress-followup',
      'tebra-psych-progress-mse',
      'tebra-psych-progress-impression',
      'tebra-psych-progress-intervention-plan',
    ]));
    expect(tebraProgressTargets.map((target) => target.aliases.join(' ')).join(' ')).toMatch(/interval update|mental status|assessment|plan/i);
  });

  it('keeps typo-heavy and provider-add-on leakage cases in the protected bank', () => {
    expect(sourcePacketRegressionCases.some((item) => /misspell|typo|qick|exposre|sertrline|anxity/i.test([
      item.title,
      item.customInstructions,
      item.sourceSections.intakeCollateral,
      item.sourceSections.clinicianNotes,
      item.sourceSections.patientTranscript,
      item.sourceSections.objectiveData,
    ].filter(Boolean).join('\n')))).toBe(true);

    expect(sourcePacketRegressionCases.some((item) => item.forbidden.some((rule) => /provider add-on|named prompt|CPT/i.test(rule.label)))).toBe(true);
  });

  it('keeps scanned document and referral packet cases in the protected source bank', () => {
    const caseText = sourcePacketRegressionCases.map((item) => [
      item.id,
      item.title,
      item.customInstructions,
      item.sourceSections.intakeCollateral,
      item.sourceSections.clinicianNotes,
      item.sourceSections.patientTranscript,
      item.sourceSections.objectiveData,
    ].filter(Boolean).join('\n')).join('\n\n');

    expect(caseText).toMatch(/OCR|scanned|ER referral|reviewed outside document|previous provider/i);
    expect(sourcePacketRegressionCases.some((item) => /ocr|scanned/i.test([
      item.id,
      item.title,
      item.sourceSections.intakeCollateral,
      item.sourceSections.objectiveData,
    ].filter(Boolean).join('\n')))).toBe(true);
    expect(sourcePacketRegressionCases.some((item) => /ER referral|outside document|reviewed document|previous provider/i.test([
      item.id,
      item.title,
      item.sourceSections.intakeCollateral,
      item.sourceSections.objectiveData,
    ].filter(Boolean).join('\n')))).toBe(true);
  });
});
