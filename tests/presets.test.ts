import { describe, expect, it } from 'vitest';
import { buildDefaultPresetForNoteType, findPresetForNoteType, getDefaultPresetCatalog, mergePresetCatalog } from '@/lib/note/presets';

describe('note presets', () => {
  it('builds a default preset for a note type', () => {
    const preset = buildDefaultPresetForNoteType('Psychiatry follow-up');
    expect(preset.noteType).toBe('Psychiatry follow-up');
    expect(preset.outputScope).toBe('full-note');
    expect(preset.requestedSections.length).toBeGreaterThan(0);
  });

  it('includes a psych HPI-only starter preset in the catalog', () => {
    const catalog = getDefaultPresetCatalog();
    const preset = catalog.find((item) => item.id === 'preset-psychiatry-follow-up-hpi-only');
    expect(preset).toBeDefined();
    expect(preset?.outputScope).toBe('hpi-only');
    expect(preset?.requestedSections).toEqual(['intervalUpdate']);
  });

  it('prefers saved presets over defaults when ids match', () => {
    const merged = mergePresetCatalog([
      {
        id: 'preset-psychiatry-follow-up-hpi-only',
        name: 'My WellSky HPI Only',
        noteType: 'Psychiatry follow-up',
        outputScope: 'hpi-only',
        requestedSections: ['intervalUpdate'],
        outputStyle: 'Concise',
        format: 'Paragraph Style',
        keepCloserToSource: true,
        flagMissingInfo: true,
        customInstructions: 'Only write HPI for WellSky.',
        isDefault: false,
      },
    ]);

    const preset = merged.find((item) => item.id === 'preset-psychiatry-follow-up-hpi-only');
    expect(preset?.name).toBe('My WellSky HPI Only');
    expect(preset?.customInstructions).toContain('WellSky');
  });

  it('finds a default preset for a matching note type', () => {
    const catalog = getDefaultPresetCatalog();
    const preset = findPresetForNoteType(catalog, 'Inpatient psych progress note');
    expect(preset).not.toBeNull();
    expect(preset?.noteType).toBe('Inpatient psych progress note');
  });
});
