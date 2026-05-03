import { describe, expect, it } from 'vitest';
import {
  ATLAS_CLINICAL_LAB_SIMULATION_BANK,
  runAtlasClinicalLabSimulationBank,
} from '@/lib/eval/clinical-labs/atlas-clinical-lab-simulation-bank';
import { summarizeAtlasClinicalLabSimulation } from '@/lib/eval/clinical-labs/run-atlas-clinical-lab-simulation';

const EXPECTED_CATEGORIES = [
  'psychiatry_medication_levels',
  'electrolytes_renal',
  'hepatic_dili',
  'hematology',
  'cardiometabolic',
  'cardiac_qtc',
  'toxicology_urgent',
];

const PHI_LIKE_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b\d{2}\/\d{2}\/\d{4}\b/,
  /\bmrn\b/i,
  /\bdob\b/i,
  /\bssn\b/i,
  /\bdate of birth\b/i,
];

describe('Atlas clinical lab simulation bank', () => {
  it('contains 100 PHI-safe clinician-style cases across the requested categories', () => {
    expect(ATLAS_CLINICAL_LAB_SIMULATION_BANK).toHaveLength(100);

    const categories = new Set(ATLAS_CLINICAL_LAB_SIMULATION_BANK.map((item) => item.category));
    for (const category of EXPECTED_CATEGORIES) {
      expect(categories.has(category)).toBe(true);
    }

    for (const testCase of ATLAS_CLINICAL_LAB_SIMULATION_BANK) {
      expect(testCase.id).toMatch(/^lab-\d{3}$/);
      expect(testCase.userQuestion.length).toBeGreaterThan(12);
      expect(testCase.expectedRoute).toMatch(/^(clinical_lab_reference|urgent_safety|safe_fallback)$/);
      expect(testCase.passFailCriteria.length).toBeGreaterThan(0);
      expect(testCase.mustNotIncludeUnsafeDirectOrder.length).toBeGreaterThan(0);

      for (const pattern of PHI_LIKE_PATTERNS) {
        expect(testCase.userQuestion).not.toMatch(pattern);
      }
    }
  });

  it('runs through current Atlas routing without throwing and produces an evaluation summary', () => {
    const results = runAtlasClinicalLabSimulationBank();
    const summary = summarizeAtlasClinicalLabSimulation(results);

    expect(results).toHaveLength(100);
    expect(summary.totalCases).toBe(100);
    expect(summary.passed + summary.failed).toBe(100);
    expect(summary.passRate).toBeGreaterThanOrEqual(0);
    expect(summary.passRate).toBeLessThanOrEqual(100);
  }, 30_000);
});
