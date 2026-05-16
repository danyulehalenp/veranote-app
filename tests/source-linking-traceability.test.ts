import { describe, expect, it } from 'vitest';

import { buildSectionSentenceEvidenceMap, buildSourceBlocks, buildSourceTraceSummary } from '@/lib/note/source-linking';
import { parseDraftSections } from '@/lib/note/review-sections';
import type { SourceSections } from '@/types/session';

const sourceSections: SourceSections = {
  intakeCollateral: [
    'Referral packet states the patient sent suicidal texts last night and family is worried about discharge.',
    'Collateral also reports poor sleep for three nights and increased pacing.',
  ].join('\n\n'),
  clinicianNotes: [
    'Patient denies current suicidal intent during interview but acknowledges hopeless statements earlier this week.',
    'Provider observed anxious affect, linear thought process, and no hallucinations during the visit.',
  ].join('\n\n'),
  patientTranscript: 'I only slept two hours and I forgot my escitalopram twice this week because my routine got messed up.',
  objectiveData: 'Medication list includes escitalopram 10 mg daily. Provider add-on: keep risk conflict visible; do not say no risk.',
};

describe('source linking traceability', () => {
  it('builds sentence-level evidence links from draft claims back to distinct source boxes', () => {
    const draftSections = parseDraftSections([
      'HPI:',
      'Patient reports sleeping only two hours and missing escitalopram twice this week.',
      '',
      'Risk:',
      'Patient denies current suicidal intent, but collateral reports suicidal texts last night.',
      '',
      'MSE:',
      'Anxious affect and linear thought process were observed during the visit.',
    ].join('\n'));

    const evidenceMap = buildSectionSentenceEvidenceMap(draftSections, sourceSections, 3);
    const hpiLinks = evidenceMap['hpi']?.flatMap((row) => row.links) || [];
    const riskLinks = evidenceMap['risk']?.flatMap((row) => row.links) || [];
    const mseLinks = evidenceMap['mse']?.flatMap((row) => row.links) || [];

    expect(hpiLinks.some((link) => link.blockId.startsWith('patientTranscript-'))).toBe(true);
    expect(riskLinks.some((link) => link.blockId.startsWith('intakeCollateral-'))).toBe(true);
    expect(riskLinks.some((link) => link.blockId.startsWith('clinicianNotes-'))).toBe(true);
    expect(mseLinks.some((link) => link.blockId.startsWith('clinicianNotes-'))).toBe(true);
  });

  it('keeps provider prompt-style add-ons from overpowering clinical source support', () => {
    const draftSections = parseDraftSections([
      'Risk:',
      'Patient denies current suicidal intent, but collateral reports suicidal texts last night.',
    ].join('\n'));

    const evidenceMap = buildSectionSentenceEvidenceMap(draftSections, sourceSections, 3);
    const topRiskRow = evidenceMap['risk']?.[0];
    const topBlockId = topRiskRow?.links[0]?.blockId || '';
    const blocks = buildSourceBlocks(sourceSections);
    const topBlock = blocks.find((block) => block.id === topBlockId);

    expect(topBlock?.sourceKey).not.toBe('objectiveData');
    expect(topRiskRow?.links.map((link) => link.blockId).some((id) => id.startsWith('intakeCollateral-'))).toBe(true);
  });

  it('summarizes source trace coverage without hiding unsupported draft sections', () => {
    const draftSections = parseDraftSections([
      'HPI:',
      'Patient reports sleeping only two hours and missing escitalopram twice this week.',
      '',
      'Risk:',
      'Patient denies current suicidal intent, but collateral reports suicidal texts last night.',
      '',
      'Unsupported:',
      'Patient is fully stable for discharge with no remaining concerns.',
    ].join('\n'));

    const summary = buildSourceTraceSummary(draftSections, sourceSections);

    expect(summary.linkedSentenceCount).toBeGreaterThanOrEqual(2);
    expect(summary.linkedSourceLabels).toEqual(expect.arrayContaining([
      'Pre-Visit Data',
      'Live Visit Notes',
      'Ambient Transcript',
    ]));
    expect(summary.unsupportedSectionCount).toBeGreaterThanOrEqual(1);
    expect(summary.sourceUsage[0]?.count).toBeGreaterThan(0);
  });
});
