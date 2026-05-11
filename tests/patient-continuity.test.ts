import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  buildContinuitySourceBlock,
  buildContinuityTodaySignals,
  buildPatientContinuityRecord,
  searchPatientContinuityRecords,
} from '@/lib/veranote/patient-continuity';

describe('patient continuity recall layer', () => {
  it('extracts follow-up-safe continuity facts without treating prior context as today fact', () => {
    const record = buildPatientContinuityRecord({
      patientLabel: 'Room 214',
      patientDescription: 'adult inpatient follow-up',
      privacyMode: 'neutral-id',
      sourceDraftId: 'draft-initial-1',
      sourceNoteType: 'Inpatient Psych Evaluation',
      sourceDate: '2026-05-01T12:00:00.000Z',
      sourceText: [
        'Patient reported suicidal ideation last night and collateral concern from family about suicidal texts.',
        'Lamotrigine was continued after medication education and rash precautions were reviewed.',
        'Follow up collateral call and repeat CMP were pending for the next visit.',
      ].join(' '),
      noteText: 'Assessment documented depression, medication adherence questions, and safety planning.',
    }, 'provider-continuity-test');

    expect(record.patientLabel).toBe('Room 214');
    expect(record.sourceDraftIds).toContain('draft-initial-1');
    expect(record.sourceNoteTypes).toContain('Inpatient Psych Evaluation');
    expect(record.continuityFacts.some((fact) => fact.category === 'risk-safety')).toBe(true);
    expect(record.continuityFacts.some((fact) => fact.category === 'medication')).toBe(true);
    expect(record.continuityFacts.some((fact) => fact.category === 'open-loop')).toBe(true);
    expect(record.todayPrepChecklist.join(' ')).toMatch(/Verify current medication adherence/i);
    expect(record.todayPrepChecklist.join(' ')).toMatch(/Reassess risk\/safety/i);

    const sourceBlock = buildContinuitySourceBlock(record);
    expect(sourceBlock).toContain('Use this as prior context only');
    expect(sourceBlock).toContain('Continuity safety rule');
    expect(sourceBlock).toContain('Patient label: Room 214');

    const todaySignals = buildContinuityTodaySignals(record, 'Today patient denies SI and reports missed doses due to rash concern.');
    expect(todaySignals.map((signal) => signal.id)).toEqual(expect.arrayContaining([
      'risk-denial-does-not-erase-history',
      'medication-reconciliation-needed',
      'open-loop-check',
    ]));
  });

  it('searches prior notes by text, date range, note type, and continuity category', () => {
    const initial = buildPatientContinuityRecord({
      patientLabel: 'Unit A initials JD',
      sourceDraftId: 'draft-jan',
      sourceNoteType: 'Inpatient Psych Evaluation',
      sourceDate: '2026-01-05T10:00:00.000Z',
      sourceText: 'Patient was started on lithium with plan to monitor lithium level, CMP, and collateral information at follow up.',
      noteText: 'Safety plan reviewed and family collateral pending.',
    }, 'provider-search-test');
    const followUp = buildPatientContinuityRecord({
      patientLabel: 'Outpatient therapy client',
      sourceDraftId: 'draft-feb',
      sourceNoteType: 'Outpatient Therapy Follow-Up',
      sourceDate: '2026-02-14T10:00:00.000Z',
      sourceText: 'Patient discussed anxiety triggers and homework completion in therapy.',
      noteText: 'No medication continuity was documented in this therapy follow-up.',
    }, 'provider-search-test');

    expect(searchPatientContinuityRecords([initial, followUp], {
      query: 'lithium draft-jan',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      noteType: 'Inpatient Psych Evaluation',
      category: 'medication',
    }).map((record) => record.id)).toEqual([initial.id]);

    expect(searchPatientContinuityRecords([initial, followUp], {
      query: 'homework therapy',
      noteType: 'Outpatient Therapy',
      category: 'active-theme',
    }).map((record) => record.id)).toEqual([followUp.id]);

    expect(searchPatientContinuityRecords([initial, followUp], {
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    })).toHaveLength(0);
  });
});

describe('patient continuity persistence', () => {
  const originalCwd = process.cwd();
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'veranote-continuity-'));
    process.chdir(tempDir);
    vi.stubEnv('VERANOTE_DB_BACKEND', 'prototype');
    vi.resetModules();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('keeps continuity snapshots provider-scoped and supports mark-used plus archive', async () => {
    const {
      archivePatientContinuityRecord,
      listPatientContinuityRecords,
      markPatientContinuityUsed,
      savePatientContinuityRecord,
    } = await import('@/lib/db/client');

    const danielRecord = buildPatientContinuityRecord({
      patientLabel: 'Daniel provider patient',
      sourceDraftId: 'draft-daniel',
      sourceNoteType: 'Inpatient Psych Progress Note',
      sourceDate: '2026-05-02T10:00:00.000Z',
      sourceText: 'Patient denied SI today but prior collateral concerns and medication adherence questions remain open.',
      noteText: 'Plan included collateral follow up and medication reconciliation.',
    }, 'provider-daniel-hale-beta');
    const otherRecord = buildPatientContinuityRecord({
      patientLabel: 'Other provider patient',
      sourceDraftId: 'draft-other',
      sourceNoteType: 'Outpatient Psych Follow-Up',
      sourceDate: '2026-05-03T10:00:00.000Z',
      sourceText: 'Patient discussed therapy homework and sleep hygiene.',
    }, 'provider-stacey-creel-beta');

    const savedDaniel = await savePatientContinuityRecord(danielRecord, 'provider-daniel-hale-beta');
    await savePatientContinuityRecord(otherRecord, 'provider-stacey-creel-beta');

    expect((await listPatientContinuityRecords('provider-daniel-hale-beta')).map((record) => record.providerIdentityId)).toEqual([
      'provider-daniel-hale-beta',
    ]);
    expect((await listPatientContinuityRecords('provider-stacey-creel-beta')).map((record) => record.providerIdentityId)).toEqual([
      'provider-stacey-creel-beta',
    ]);

    const marked = await markPatientContinuityUsed(savedDaniel.id, 'provider-daniel-hale-beta');
    expect(marked?.lastUsedAt).toBeTruthy();

    const archived = await archivePatientContinuityRecord(savedDaniel.id, 'provider-daniel-hale-beta');
    expect(archived?.archivedAt).toBeTruthy();
    expect(await listPatientContinuityRecords('provider-daniel-hale-beta')).toHaveLength(0);
    expect(await listPatientContinuityRecords('provider-daniel-hale-beta', { includeArchived: true })).toHaveLength(1);
  });
});
