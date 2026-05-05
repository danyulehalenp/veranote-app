import { describe, expect, it } from 'vitest';
import {
  getAssistantToolDefinition,
  getAssistantToolRiskLabel,
  listAssistantToolsForStage,
} from '@/lib/veranote/assistant-tool-registry';

describe('assistant tool registry', () => {
  it('returns metadata for known assistant actions', () => {
    const tool = getAssistantToolDefinition({
      type: 'apply-note-revision',
      label: 'Apply requested note revision',
      instructions: 'Add the detail.',
      revisionText: 'Patient reports being off medications for 4 months.',
    });

    expect(tool.riskLevel).toBe('apply');
    expect(tool.allowedStages).toContain('review');
  });

  it('treats full-draft rewrites as review-stage apply actions', () => {
    const tool = getAssistantToolDefinition({
      type: 'apply-draft-rewrite',
      label: 'Apply to Draft',
      instructions: 'Replace the active draft and keep the prior version.',
      draftText: 'HPI: Patient reports improved sleep.',
      rewriteLabel: 'one-paragraph format',
    });

    expect(tool.riskLevel).toBe('apply');
    expect(tool.allowedStages).toEqual(['review']);
    expect(tool.summary).toContain('prior version');
  });

  it('returns readable risk labels', () => {
    expect(getAssistantToolRiskLabel('read-only')).toBe('Read only');
    expect(getAssistantToolRiskLabel('draft')).toBe('Draft suggestion');
    expect(getAssistantToolRiskLabel('apply')).toBe('Applies to draft');
  });

  it('filters tools by allowed stage', () => {
    const composeTools = listAssistantToolsForStage('compose');
    const reviewTools = listAssistantToolsForStage('review');

    expect(composeTools.some((tool) => tool.type === 'replace-preferences')).toBe(true);
    expect(composeTools.some((tool) => tool.type === 'jump-to-source-evidence')).toBe(false);
    expect(reviewTools.some((tool) => tool.type === 'jump-to-source-evidence')).toBe(true);
  });
});
