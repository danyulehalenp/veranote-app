import { describe, expect, it } from 'vitest';
import { assembleAssistantApiContext, resolveAssistantStageForPathname } from '@/lib/veranote/assistant-context-assembly';

describe('assistant context assembly', () => {
  it('resolves supported assistant stages from pathname', () => {
    expect(resolveAssistantStageForPathname('/')).toBe('compose');
    expect(resolveAssistantStageForPathname('/dashboard/review')).toBe('review');
    expect(resolveAssistantStageForPathname('/dashboard/drafts')).toBeNull();
  });

  it('assembles api context from a snapshot payload', () => {
    const context = assembleAssistantApiContext({
      stage: 'review',
      noteType: 'Inpatient Psych Progress Note',
      currentDraftText: 'Assessment: depressive symptoms persist.',
      providerAddressingName: 'Daniel Hale',
      topHighRiskWarningTitle: 'Timeline drift',
      focusedSectionHeading: 'Assessment',
      needsReviewCount: 2,
    });

    expect(context.stage).toBe('review');
    expect(context.noteType).toBe('Inpatient Psych Progress Note');
    expect(context.currentDraftText).toBe('Assessment: depressive symptoms persist.');
    expect(context.providerAddressingName).toBe('Daniel Hale');
    expect(context.topHighRiskWarningTitle).toBe('Timeline drift');
    expect(context.focusedSectionHeading).toBe('Assessment');
    expect(context.needsReviewCount).toBe(2);
  });
});
