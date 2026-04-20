import { NextResponse } from 'next/server';
import { listDrafts, saveDraft } from '@/lib/db/client';
import { normalizeDiagnosisProfile } from '@/lib/note/diagnosis-profile';
import { normalizeEncounterSupport } from '@/lib/note/encounter-support';
import { normalizeMedicationProfile } from '@/lib/note/medication-profile';
import type { NoteSectionKey, OutputScope } from '@/lib/note/section-profiles';
import type { DraftSession } from '@/types/session';

export async function GET() {
  const drafts = await listDrafts();
  return NextResponse.json({ drafts });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<DraftSession>;

  if (typeof body?.sourceInput !== 'string' || !body.sourceInput.trim()) {
    return NextResponse.json({ error: 'Source input is required.' }, { status: 400 });
  }

  if (typeof body?.note !== 'string') {
    return NextResponse.json({ error: 'Draft note content is required.' }, { status: 400 });
  }

  const draft: DraftSession = {
    specialty: typeof body.specialty === 'string' ? body.specialty : 'Psychiatry',
    role: typeof body.role === 'string' ? body.role : 'Psychiatric NP',
    noteType: typeof body.noteType === 'string' ? body.noteType : 'Inpatient Psych Progress Note',
    template: typeof body.template === 'string' ? body.template : 'Default Inpatient Psych Progress Note',
    outputStyle: typeof body.outputStyle === 'string' ? body.outputStyle : 'Standard',
    format: typeof body.format === 'string' ? body.format : 'Labeled Sections',
    keepCloserToSource: body.keepCloserToSource !== false,
    flagMissingInfo: body.flagMissingInfo !== false,
    outputScope: typeof body.outputScope === 'string' ? body.outputScope as OutputScope : undefined,
    requestedSections: Array.isArray(body.requestedSections)
      ? body.requestedSections.filter((item): item is NoteSectionKey => typeof item === 'string')
      : undefined,
    selectedPresetId: typeof body.selectedPresetId === 'string' ? body.selectedPresetId : undefined,
    presetName: typeof body.presetName === 'string' ? body.presetName : undefined,
    customInstructions: typeof body.customInstructions === 'string' ? body.customInstructions : undefined,
    encounterSupport: normalizeEncounterSupport(body.encounterSupport, typeof body.noteType === 'string' ? body.noteType : 'Inpatient Psych Progress Note'),
    medicationProfile: normalizeMedicationProfile(body.medicationProfile),
    diagnosisProfile: normalizeDiagnosisProfile(body.diagnosisProfile),
    sourceInput: body.sourceInput,
    sourceSections: body.sourceSections,
    note: body.note,
    flags: Array.isArray(body.flags) ? body.flags.filter((item): item is string => typeof item === 'string') : [],
    copilotSuggestions: Array.isArray(body.copilotSuggestions) ? body.copilotSuggestions : [],
    sectionReviewState: body.sectionReviewState,
    mode: body.mode === 'fallback' ? 'fallback' : 'live',
    warning: typeof body.warning === 'string' ? body.warning : undefined,
  };

  const saved = await saveDraft(draft);
  return NextResponse.json({ draft: saved });
}
