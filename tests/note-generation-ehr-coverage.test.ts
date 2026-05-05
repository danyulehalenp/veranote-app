import { describe, expect, it } from 'vitest';

import { sourcePacketRegressionCases } from '@/lib/eval/note-generation/source-packet-regression';

describe('note generation EHR and workflow coverage', () => {
  it('keeps source-packet regression broad enough for psych, therapy, medical, and EHR-ready workflows', () => {
    expect(sourcePacketRegressionCases.length).toBeGreaterThanOrEqual(20);

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
});
