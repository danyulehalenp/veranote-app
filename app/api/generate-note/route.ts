import { NextResponse } from 'next/server';
import { generateNote } from '@/lib/ai/generate-note';
import { buildSourceInputFromSections, normalizeSourceSections } from '@/lib/ai/source-sections';
import { normalizeDiagnosisProfile } from '@/lib/note/diagnosis-profile';
import { normalizeEncounterSupport } from '@/lib/note/encounter-support';
import { normalizeMedicationProfile } from '@/lib/note/medication-profile';

export async function POST(request: Request) {
  const body = await request.json();
  const sourceSections = normalizeSourceSections(body?.sourceSections);
  const sourceInputFromSections = buildSourceInputFromSections(sourceSections);
  const sourceInput = typeof body?.sourceInput === 'string' && body.sourceInput.trim() ? body.sourceInput : sourceInputFromSections;
  const noteType = typeof body?.noteType === 'string' ? body.noteType : 'Psychiatry Follow-Up';

  if (!sourceInput.trim()) {
    return NextResponse.json({ error: 'Source input is required.' }, { status: 400 });
  }

  const result = await generateNote({
    specialty: typeof body?.specialty === 'string' ? body.specialty : 'Psychiatry',
    noteType,
    outputStyle: typeof body?.outputStyle === 'string' ? body.outputStyle : 'Standard',
    format: typeof body?.format === 'string' ? body.format : 'Labeled Sections',
    keepCloserToSource: Boolean(body?.keepCloserToSource),
    flagMissingInfo: body?.flagMissingInfo !== false,
    outputScope: typeof body?.outputScope === 'string' ? body.outputScope : undefined,
    requestedSections: Array.isArray(body?.requestedSections) ? body.requestedSections : undefined,
    customInstructions: typeof body?.customInstructions === 'string' ? body.customInstructions : undefined,
    sourceInput,
    sourceSections,
    encounterSupport: normalizeEncounterSupport(body?.encounterSupport, noteType),
    medicationProfile: normalizeMedicationProfile(body?.medicationProfile),
    diagnosisProfile: normalizeDiagnosisProfile(body?.diagnosisProfile),
  });

  return NextResponse.json(result);
}
