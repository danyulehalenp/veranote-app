import { describe, expect, it } from 'vitest';
import { buildAssistantModeMeta, getAssistantModeDefinition, listAssistantModeDefinitions } from '@/lib/veranote/assistant-mode';

describe('assistant mode definitions', () => {
  it('exposes the supported Vera modes through one shared definition layer', () => {
    const modes = listAssistantModeDefinitions().map((entry) => entry.mode);

    expect(modes).toEqual(['workflow-help', 'prompt-builder', 'reference-lookup']);
    expect(getAssistantModeDefinition('reference-lookup').label).toBe('Reference lookup');
  });

  it('builds compact mode metadata for responses', () => {
    expect(buildAssistantModeMeta('workflow-help', 'compose')).toEqual({
      mode: 'workflow-help',
      label: 'Workflow help',
      shortLabel: 'Workflow',
      detail: 'Note-grounded help for setup, drafting, and section work.',
    });
  });
});
