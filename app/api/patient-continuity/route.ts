import { NextResponse } from 'next/server';
import {
  archivePatientContinuityRecord,
  listPatientContinuityRecords,
  markPatientContinuityUsed,
  savePatientContinuityRecord,
} from '@/lib/db/client';
import {
  buildContinuitySourceBlock,
  buildPatientContinuityRecord,
  searchPatientContinuityRecords,
} from '@/lib/veranote/patient-continuity';
import { getAuthorizedProviderContext, resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';
import type { PatientContinuityInput, PatientContinuitySearchInput } from '@/types/patient-continuity';

function parseSearchParams(request: Request): PatientContinuitySearchInput & { providerId?: string; recordId?: string } {
  const { searchParams } = new URL(request.url);

  return {
    providerId: searchParams.get('providerId') || undefined,
    recordId: searchParams.get('recordId') || undefined,
    query: searchParams.get('query') || searchParams.get('q') || undefined,
    dateFrom: searchParams.get('dateFrom') || undefined,
    dateTo: searchParams.get('dateTo') || undefined,
    noteType: searchParams.get('noteType') || undefined,
    category: (searchParams.get('category') || undefined) as PatientContinuitySearchInput['category'],
    includeArchived: searchParams.get('includeArchived') === 'true',
  };
}

export async function GET(request: Request) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const search = parseSearchParams(request);
  const providerId = resolveScopedProviderIdentityId(search.providerId, authorizedProvider.providerIdentityId);
  const records = await listPatientContinuityRecords(providerId, { includeArchived: search.includeArchived });
  const filtered = searchPatientContinuityRecords(records, search);
  const activeRecord = search.recordId
    ? filtered.find((record) => record.id === search.recordId) || null
    : filtered[0] || null;

  return NextResponse.json({
    records: filtered,
    activeRecord,
    continuitySourceBlock: activeRecord ? buildContinuitySourceBlock(activeRecord) : '',
  });
}

export async function POST(request: Request) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as PatientContinuityInput & {
    providerId?: string;
    recordId?: string;
    action?: 'save-snapshot' | 'mark-used' | 'archive';
  };
  const providerId = resolveScopedProviderIdentityId(body.providerId, authorizedProvider.providerIdentityId);

  if (body.action === 'mark-used' && body.recordId) {
    const record = await markPatientContinuityUsed(body.recordId, providerId);
    if (!record) {
      return NextResponse.json({ error: 'Continuity record not found.' }, { status: 404 });
    }

    return NextResponse.json({ record, continuitySourceBlock: buildContinuitySourceBlock(record) });
  }

  if (body.action === 'archive' && body.recordId) {
    const record = await archivePatientContinuityRecord(body.recordId, providerId);
    if (!record) {
      return NextResponse.json({ error: 'Continuity record not found.' }, { status: 404 });
    }

    return NextResponse.json({ record });
  }

  const existingRecords = await listPatientContinuityRecords(providerId, { includeArchived: true });
  const existingRecord = body.recordId
    ? existingRecords.find((record) => record.id === body.recordId) || null
    : null;
  const record = buildPatientContinuityRecord({
    ...body,
    existingRecord,
  }, providerId);
  const saved = await savePatientContinuityRecord(record, providerId);

  return NextResponse.json({
    record: saved,
    records: searchPatientContinuityRecords(await listPatientContinuityRecords(providerId), {}),
    continuitySourceBlock: buildContinuitySourceBlock(saved),
  });
}
