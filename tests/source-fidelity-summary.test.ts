import { describe, expect, it } from 'vitest';
import { buildSourceFidelitySummary } from '@/lib/note/source-fidelity-summary';
import type { SectionEvidenceMap } from '@/lib/note/source-linking';

describe('source fidelity summary', () => {
  it('surfaces source evidence gaps, weak support, and conflicts as clinician review items', () => {
    const evidenceMap: SectionEvidenceMap = {
      hpi: {
        sectionAnchor: 'hpi',
        sectionHeading: 'HPI',
        sectionTerms: ['depressed', 'sleep'],
        links: [{
          blockId: 'clinicianNotes-1',
          score: 0.72,
          overlapTerms: ['depressed', 'sleep'],
          signal: 'strong-overlap',
        }],
      },
      mse: {
        sectionAnchor: 'mse',
        sectionHeading: 'MSE',
        sectionTerms: ['hopeless'],
        links: [{
          blockId: 'patientTranscript-1',
          score: 0.22,
          overlapTerms: ['hopeless'],
          signal: 'weak-overlap',
        }],
      },
      plan: {
        sectionAnchor: 'plan',
        sectionHeading: 'Plan',
        sectionTerms: ['continue'],
        links: [],
      },
    };

    const summary = buildSourceFidelitySummary({
      sections: [
        { anchor: 'hpi', heading: 'HPI' },
        { anchor: 'mse', heading: 'MSE' },
        { anchor: 'plan', heading: 'Plan' },
      ],
      evidenceMap,
      confirmedEvidenceBySection: { hpi: ['clinicianNotes-1'] },
      totalSourceBlocks: 4,
      contradictionFlags: ['Possible contradiction: Patient denies SI, collateral reports suicidal texts.'],
      objectiveConflictBullets: ['Medication list and patient report do not match.'],
      missingInfoFlags: ['Appearance not documented.'],
      highRiskWarningLabels: ['Unsupported no-risk wording'],
      medicationWarningLabels: ['Lithium renal safety'],
      mseReviewLabels: ['thought content: hopeless'],
    });

    expect(summary.totalSections).toBe(3);
    expect(summary.linkedSections).toBe(2);
    expect(summary.noEvidenceSections).toBe(1);
    expect(summary.weakOnlySections).toBe(1);
    expect(summary.confirmedSections).toBe(1);
    expect(summary.openReviewItems).toBeGreaterThanOrEqual(6);
    expect(summary.reviewItems[0]?.severity).toBe('caution');
    expect(summary.reviewItems.map((item) => item.category)).toEqual(expect.arrayContaining([
      'Conflict',
      'Evidence',
      'Medication',
      'MSE',
      'Missing data',
      'Risk',
    ]));
    expect(summary.reviewItems.some((item) => /collateral reports suicidal texts/i.test(item.detail))).toBe(true);
  });

  it('reports a ready source trace when every section has confirmed strong support and no review flags', () => {
    const evidenceMap: SectionEvidenceMap = {
      hpi: {
        sectionAnchor: 'hpi',
        sectionHeading: 'HPI',
        sectionTerms: ['improved'],
        links: [{
          blockId: 'clinicianNotes-1',
          score: 0.81,
          overlapTerms: ['improved'],
          signal: 'strong-overlap',
        }],
      },
    };

    const summary = buildSourceFidelitySummary({
      sections: [{ anchor: 'hpi', heading: 'HPI' }],
      evidenceMap,
      confirmedEvidenceBySection: { hpi: ['clinicianNotes-1'] },
      totalSourceBlocks: 1,
    });

    expect(summary.statusLabel).toBe('Source trace ready');
    expect(summary.openReviewItems).toBe(0);
    expect(summary.reviewItems.every((item) => item.severity === 'info')).toBe(true);
  });

  it('removes reviewed and dismissed source-fidelity items from the open count', () => {
    const evidenceMap: SectionEvidenceMap = {
      hpi: {
        sectionAnchor: 'hpi',
        sectionHeading: 'HPI',
        sectionTerms: ['sleep'],
        links: [],
      },
    };

    const summary = buildSourceFidelitySummary({
      sections: [{ anchor: 'hpi', heading: 'HPI' }],
      evidenceMap,
      confirmedEvidenceBySection: {},
      totalSourceBlocks: 2,
      contradictionFlags: ['Possible contradiction: Patient denies SI but collateral reports suicidal texts.'],
      reviewState: {
        'section-evidence-missing': {
          id: 'section-evidence-missing',
          status: 'reviewed',
          updatedAt: '2026-05-08T12:00:00.000Z',
        },
        'source-conflict-0': {
          id: 'source-conflict-0',
          status: 'dismissed',
          updatedAt: '2026-05-08T12:01:00.000Z',
        },
      },
    });

    expect(summary.openReviewItems).toBe(0);
    expect(summary.reviewedReviewItems).toBe(1);
    expect(summary.dismissedReviewItems).toBe(1);
    expect(summary.reviewItems.find((item) => item.id === 'section-evidence-missing')?.reviewStatus).toBe('reviewed');
    expect(summary.reviewItems.find((item) => item.id === 'source-conflict-0')?.reviewStatus).toBe('dismissed');
  });

  it('keeps needs-revision source-fidelity items open for clinician follow-up', () => {
    const evidenceMap: SectionEvidenceMap = {
      plan: {
        sectionAnchor: 'plan',
        sectionHeading: 'Plan',
        sectionTerms: ['discharge'],
        links: [],
      },
    };

    const summary = buildSourceFidelitySummary({
      sections: [{ anchor: 'plan', heading: 'Plan' }],
      evidenceMap,
      confirmedEvidenceBySection: {},
      totalSourceBlocks: 2,
      highRiskWarningLabels: ['Unsupported stable for discharge wording'],
      reviewState: {
        'risk-warning-0': {
          id: 'risk-warning-0',
          status: 'needs-revision',
          updatedAt: '2026-05-09T12:00:00.000Z',
        },
      },
    });

    expect(summary.openReviewItems).toBeGreaterThan(0);
    expect(summary.reviewItems.find((item) => item.id === 'risk-warning-0')?.reviewStatus).toBe('needs-revision');
    expect(summary.statusLabel).toMatch(/source safety item/i);
  });
});
