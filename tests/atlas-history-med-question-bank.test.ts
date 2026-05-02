import { describe, expect, it } from 'vitest';
import {
  atlasHistoryMedQuestionBank,
  type AtlasExpectedRoute,
  type AtlasHistoryMedCategory,
  type AtlasHistoryMedSeverity,
} from '@/lib/eval/med-reference/atlas-history-med-question-bank';
import { runAtlasHistoryMedSimulation } from '@/lib/eval/med-reference/run-atlas-history-med-simulation';

const validCategories = new Set<AtlasHistoryMedCategory>([
  'formulations / LAI / conversion',
  'monitoring',
  'safety / adverse effects',
  'interactions',
  'lab interpretation',
  'shorthand/rushed questions',
  'toxicology/urgent',
]);

const validRoutes = new Set<AtlasExpectedRoute>([
  'med_reference',
  'clinical_lab_reference',
  'urgent_safety',
  'interaction_safety',
  'lai_conversion_framework',
  'taper_switch_framework',
  'cautious_fallback',
]);

const validSeverities = new Set<AtlasHistoryMedSeverity>([
  'low',
  'medium',
  'high',
  'critical',
]);

const expectedCategoryCounts: Record<AtlasHistoryMedCategory, number> = {
  'formulations / LAI / conversion': 10,
  monitoring: 10,
  'safety / adverse effects': 12,
  interactions: 12,
  'lab interpretation': 12,
  'shorthand/rushed questions': 6,
  'toxicology/urgent': 8,
};

const phiLikePatterns = [
  /\bDaniel\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
  /\b(?:record|chart|patient)\s*(?:number|id)\s*[:#]\s*\w+/i,
  /\b(?:birth date|date of birth|dob)\b/i,
  /\b\d{1,2}\/\d{1,2}\/(?:\d{2}|\d{4})\b/,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b(?:hospital|clinic|facility)\s+(?:named|called)\s+[A-Z][a-z]+/i,
];

describe('Atlas history medication/lab question bank', () => {
  it('contains the extracted 70 PHI-safe cases', () => {
    expect(atlasHistoryMedQuestionBank).toHaveLength(70);
  });

  it('has required fields and valid enums', () => {
    for (const item of atlasHistoryMedQuestionBank) {
      expect(item.id).toMatch(/^atlas-history-med-\d{3}$/);
      expect(item.originalDeidentifiedQuestion.length).toBeGreaterThanOrEqual(12);
      expect(validCategories.has(item.category)).toBe(true);
      expect(validRoutes.has(item.expectedRoute)).toBe(true);
      expect(validSeverities.has(item.severity)).toBe(true);
      expect(item.sourceType).toBe('history_extracted');
      expect(item.expectedConcepts.length).toBeGreaterThanOrEqual(3);
      expect(item.requiredCaveats.length).toBeGreaterThanOrEqual(2);
      expect(item.mustNotIncludeUnsafeContent.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('has unique IDs and the expected category distribution', () => {
    const ids = atlasHistoryMedQuestionBank.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);

    const counts = Object.fromEntries(
      [...validCategories].map((category) => [
        category,
        atlasHistoryMedQuestionBank.filter((item) => item.category === category).length,
      ]),
    );

    expect(counts).toEqual(expectedCategoryCounts);
  });

  it('covers every expected Atlas route family', () => {
    const routes = new Set(
      atlasHistoryMedQuestionBank.map((item) => item.expectedRoute),
    );

    for (const route of validRoutes) {
      expect(routes.has(route)).toBe(true);
    }
  });

  it('does not contain obvious PHI markers', () => {
    for (const item of atlasHistoryMedQuestionBank) {
      const searchable = [
        item.originalDeidentifiedQuestion,
        ...item.expectedConcepts,
        ...item.requiredCaveats,
        ...item.mustNotIncludeUnsafeContent,
      ].join('\n');

      for (const pattern of phiLikePatterns) {
        expect(searchable).not.toMatch(pattern);
      }
    }
  });

  it('runs through the live Atlas medication/lab route adapter', () => {
    const output = runAtlasHistoryMedSimulation();

    expect(output.summary.routeAvailable).toBe(true);
    expect(output.summary.adapterName).toBe(
      'buildPsychMedicationReferenceHelp-live-atlas-med-lab-route',
    );
    expect(output.summary.totalCases).toBe(atlasHistoryMedQuestionBank.length);
    expect(output.cases).toHaveLength(atlasHistoryMedQuestionBank.length);
    expect(output.summary.passed + output.summary.failed).toBe(output.cases.length);
    expect(output.summary.unsafeAnswerCount).toBeGreaterThanOrEqual(0);
    expect(output.summary.overConservativeFallbackCount).toBeGreaterThanOrEqual(0);
  });
});
