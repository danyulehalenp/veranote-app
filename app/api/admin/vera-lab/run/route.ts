import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { requireRole } from '@/lib/auth/role-check';
import { runVeraLabBatch } from '@/lib/veranote/lab/interrogator';
import { runRepeatedVeraLabCycles } from '@/lib/veranote/lab/repeated-runner';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';
import type { AssistantMode, AssistantStage } from '@/types/assistant';

type RunBody = {
  repeated?: boolean;
  cycles?: number;
  casesPerCycle?: number;
  stopOnCriticalFailure?: boolean;
  mode?: AssistantMode;
  stage?: AssistantStage;
  providerProfileId?: string | null;
  provider_profile_id?: string | null;
  tester_version?: string;
  repair_version?: string;
  pack_ids?: string[];
  categories?: string[];
};

export async function POST(request: Request) {
  if (!INTERNAL_MODE_ENABLED) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const authContext = await requireAuth(request);
    requireRole(authContext.user, 'admin');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: RunBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    const sharedOptions = {
      mode: body.mode || 'workflow-help',
      stage: body.stage || 'review',
      provider_profile_id: body.providerProfileId ?? body.provider_profile_id ?? null,
      tester_version: body.tester_version || 'vera-lab-v1',
      repair_version: body.repair_version || 'repair-router-v1',
      pack_ids: body.pack_ids || [],
      categories: body.categories as any,
    };

    const result = body.repeated
      ? await runRepeatedVeraLabCycles({
          ...sharedOptions,
          cycles: body.cycles,
          casesPerCycle: body.casesPerCycle,
          stopOnCriticalFailure: body.stopOnCriticalFailure,
        })
      : await runVeraLabBatch(sharedOptions);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to run Atlas Lab batch.',
    }, { status: 500 });
  }
}
