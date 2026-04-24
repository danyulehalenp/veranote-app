import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { DraftSession } from '@/types/session';

function createDraft(overrides?: Partial<DraftSession>): DraftSession {
  return {
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    noteType: 'Inpatient Psych Progress Note',
    template: 'Default Inpatient Psych Progress Note',
    outputStyle: 'Standard',
    format: 'Labeled Sections',
    keepCloserToSource: true,
    flagMissingInfo: true,
    sourceInput: 'Patient reports anxiety and insomnia.',
    note: 'HPI: Patient reports anxiety and insomnia.',
    flags: [],
    copilotSuggestions: [],
    mode: 'live',
    ...overrides,
  };
}

describe('draft persistence', () => {
  const originalCwd = process.cwd();
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'veranote-drafts-'));
    process.chdir(tempDir);
    vi.resetModules();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('updates an existing provider draft in place and increments its version', async () => {
    const { saveDraft, listDrafts } = await import('@/lib/db/client');

    const firstSave = await saveDraft(createDraft(), 'provider-daniel-hale-beta');
    const secondSave = await saveDraft(createDraft({
      draftId: firstSave.id,
      draftVersion: firstSave.version,
      note: 'HPI: Patient reports improving sleep with ongoing anxiety.',
    }), 'provider-daniel-hale-beta');

    expect(secondSave.id).toBe(firstSave.id);
    expect(secondSave.version).toBe(2);
    expect(secondSave.draftVersion).toBe(2);

    const drafts = await listDrafts('provider-daniel-hale-beta', { includeArchived: true });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].note).toContain('improving sleep');
  });

  it('keeps drafts isolated by provider and excludes archived drafts from latest restore', async () => {
    const { archiveDraft, getLatestDraft, listDrafts, saveDraft } = await import('@/lib/db/client');

    const danielDraft = await saveDraft(createDraft(), 'provider-daniel-hale-beta');
    await saveDraft(createDraft({ note: 'Different provider draft.' }), 'provider-stacey-creel-beta');

    expect((await listDrafts('provider-daniel-hale-beta')).map((draft) => draft.providerIdentityId)).toEqual(['provider-daniel-hale-beta']);
    expect((await listDrafts('provider-stacey-creel-beta')).map((draft) => draft.providerIdentityId)).toEqual(['provider-stacey-creel-beta']);

    await archiveDraft(danielDraft.id, 'provider-daniel-hale-beta');

    expect(await getLatestDraft('provider-daniel-hale-beta')).toBeNull();
    expect(await getLatestDraft('provider-stacey-creel-beta')).toMatchObject({
      providerIdentityId: 'provider-stacey-creel-beta',
    });
  });

  it('persists dictation provenance with the draft session', async () => {
    const { getLatestDraft, saveDraft } = await import('@/lib/db/client');

    await saveDraft(createDraft({
      dictationInsertions: {
        clinicianNotes: [{
          segmentId: 'segment-1',
          dictationSessionId: 'dictation-session-1',
          targetSection: 'clinicianNotes',
          text: 'Patient denies SI and requests discharge.',
          insertedAt: '2026-04-23T00:00:00.000Z',
          transactionId: 'dictation-tx-1',
          provider: 'mock-stt',
          sourceMode: 'manual',
          reviewFlags: [{
            flagType: 'risk_language',
            severity: 'critical',
            matchedText: 'SI',
            message: 'Risk language should be reviewed before it is used as source truth.',
          }],
        }],
      },
    }), 'provider-daniel-hale-beta');

    const saved = await getLatestDraft('provider-daniel-hale-beta');
    expect(saved?.dictationInsertions?.clinicianNotes?.[0]?.transactionId).toBe('dictation-tx-1');
    expect(saved?.dictationInsertions?.clinicianNotes?.[0]?.reviewFlags?.[0]?.flagType).toBe('risk_language');
  });
});
