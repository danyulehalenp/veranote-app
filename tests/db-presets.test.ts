import { describe, expect, it } from 'vitest';
import { listNotePresets, saveNotePresets } from '@/lib/db/client';

describe('db preset persistence', () => {
  it('lists presets from prototype db', async () => {
    const presets = await listNotePresets();
    expect(Array.isArray(presets)).toBe(true);
    expect(presets.length).toBeGreaterThan(0);
  });

  it('saves presets and keeps starter presets merged in', async () => {
    const saved = await saveNotePresets([
      {
        id: 'preset-custom-db-test',
        name: 'DB Test Preset',
        noteType: 'Psychiatry follow-up',
        outputScope: 'hpi-only',
        requestedSections: ['intervalUpdate'],
        outputStyle: 'Concise',
        format: 'Paragraph Style',
        keepCloserToSource: true,
        flagMissingInfo: true,
        customInstructions: 'Only write HPI.',
        isDefault: false,
        locked: false,
      },
    ]);

    expect(saved.find((preset) => preset.id === 'preset-custom-db-test')).toBeDefined();
    expect(saved.some((preset) => preset.locked)).toBe(true);
  });
});
