import { describe, expect, it } from 'vitest';
import { buildDiagnosisProfilePromptLines, buildDiagnosisProfileSummary, normalizeDiagnosisProfile } from '@/lib/note/diagnosis-profile';
import { buildMedicationProfileGapSummary, buildMedicationProfilePromptLines, buildMedicationProfileSummary, hasMedicationProfileUnresolvedEntries, normalizeMedicationProfile } from '@/lib/note/medication-profile';

describe('structured profile input normalization', () => {
  it('preserves live typing whitespace in diagnosis labels while still normalizing lookup data', () => {
    const result = normalizeDiagnosisProfile([
      {
        id: 'dx-1',
        rawLabel: 'suicidal ',
        status: 'symptom-level',
        certainty: 'low',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.rawLabel).toBe('suicidal ');
    expect(result[0]?.normalizedDiagnosisId).toBeUndefined();
  });

  it('builds trimmed diagnosis summaries and prompt lines from spaced input', () => {
    const entry = {
      id: 'dx-2',
      rawLabel: 'major depressive disorder ',
      status: 'current-working' as const,
      certainty: 'moderate' as const,
      timeframeNote: ' 2 weeks of depressive symptoms ',
      evidenceNote: ' mood low most days ',
      clinicianComment: ' keep bipolar differential open ',
    };

    const summary = buildDiagnosisProfileSummary([entry]);
    const promptLines = buildDiagnosisProfilePromptLines([entry]);

    expect(summary[0]).toContain('Major depressive disorder');
    expect(summary[0]).toContain('2 weeks of depressive symptoms');
    expect(promptLines[0]).toContain('Diagnosis/profile label: Major depressive disorder');
    expect(promptLines[0]).toContain('timeframe note=2 weeks of depressive symptoms');
    expect(promptLines[0]).toContain('evidence note=mood low most days');
    expect(promptLines[0]).toContain('clinician comment=keep bipolar differential open');
  });

  it('preserves live typing whitespace in medication fields while keeping trimmed summaries', () => {
    const normalized = normalizeMedicationProfile([
      {
        id: 'med-1',
        rawName: 'sertraline ',
        doseText: '100 ',
        scheduleText: 'daily ',
        route: 'oral ',
        status: 'current',
        adherenceNote: 'misses doses on weekends ',
        sideEffectNote: 'mild nausea ',
        clinicianComment: 'continue for now ',
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.rawName).toBe('sertraline ');
    expect(normalized[0]?.doseText).toBe('100 ');
    expect(normalized[0]?.scheduleText).toBe('daily ');
    expect(normalized[0]?.route).toBe('oral ');

    const summary = buildMedicationProfileSummary(normalized);
    const promptLines = buildMedicationProfilePromptLines(normalized);

    expect(summary[0]).toContain('sertraline');
    expect(summary[0]).toContain('100');
    expect(summary[0]).toContain('daily');
    expect(promptLines[0]).toContain('sertraline');
    expect(promptLines[0]).toContain('dose: 100');
    expect(promptLines[0]).toContain('schedule: daily');
    expect(promptLines[0]).toContain('route: oral');
    expect(promptLines[0]).toContain('adherence: misses doses on weekends');
    expect(promptLines[0]).toContain('side effects: mild nausea');
    expect(promptLines[0]).toContain('comment: continue for now');
  });

  it('keeps diagnosis entries alive when only family focus is selected', () => {
    const result = normalizeDiagnosisProfile([
      {
        id: 'dx-family-1',
        rawLabel: '',
        familyFocus: 'Depressive disorders',
        status: 'differential',
        certainty: 'unclear',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.familyFocus).toBe('Depressive disorders');

    const summary = buildDiagnosisProfileSummary(result);
    const promptLines = buildDiagnosisProfilePromptLines(result);

    expect(summary).toHaveLength(0);
    expect(promptLines).toHaveLength(0);
  });

  it('detects unresolved medication names and missing regimen detail conservatively', () => {
    const normalized = normalizeMedicationProfile([
      {
        id: 'med-gap-1',
        rawName: 'sertraline',
        status: 'current',
        doseText: '',
        scheduleText: 'daily',
        route: '',
      },
      {
        id: 'med-gap-2',
        rawName: 'mystery psych med',
        status: 'current',
      },
    ]);

    const gaps = buildMedicationProfileGapSummary(normalized);

    expect(gaps.unresolvedEntries).toHaveLength(1);
    expect(gaps.unresolvedEntries[0]?.rawName).toBe('mystery psych med');
    expect(gaps.missingRegimenEntries).toHaveLength(1);
    expect(gaps.missingRegimenEntries[0]?.rawName).toBe('sertraline');
    expect(gaps.missingRouteEntries).toHaveLength(1);
    expect(hasMedicationProfileUnresolvedEntries(normalized)).toBe(true);
  });
});
