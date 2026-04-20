import { describe, expect, it } from 'vitest';
import { getDefaultPresetCatalog, mergePresetCatalog } from '@/lib/note/presets';

describe('preset catalog locking behavior', () => {
  it('marks starter presets as locked', () => {
    const presets = getDefaultPresetCatalog();
    expect(presets.every((preset) => preset.locked)).toBe(true);
  });

  it('keeps a saved custom preset alongside locked starters', () => {
    const merged = mergePresetCatalog([
      {
        id: 'preset-custom-123',
        name: 'My Custom Inpatient',
        noteType: 'Inpatient psych progress note',
        outputScope: 'selected-sections',
        requestedSections: ['intervalUpdate', 'assessment', 'plan'],
        outputStyle: 'Concise',
        format: 'Paragraph Style',
        keepCloserToSource: true,
        flagMissingInfo: true,
        customInstructions: 'Short inpatient note.',
        isDefault: false,
        locked: false,
      },
    ]);

    expect(merged.find((preset) => preset.id === 'preset-custom-123')).toBeDefined();
    expect(merged.find((preset) => preset.id === 'preset-custom-123')?.locked).toBe(false);
  });
});
