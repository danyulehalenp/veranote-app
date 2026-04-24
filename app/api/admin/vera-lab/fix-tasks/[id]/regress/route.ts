import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { requireRole } from '@/lib/auth/role-check';
import { rerunVeraLabRegressionGate } from '@/lib/veranote/lab/interrogator';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';
import type { AssistantMode, AssistantStage } from '@/types/assistant';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!INTERNAL_MODE_ENABLED) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const authContext = await requireAuth(request);
    requireRole(authContext.user, 'admin');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { mode?: AssistantMode; stage?: AssistantStage; tester_version?: string; repair_version?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const params = await context.params;
    const results = await rerunVeraLabRegressionGate(params.id, {
      mode: body.mode || 'workflow-help',
      stage: body.stage || 'review',
      tester_version: body.tester_version || 'vera-lab-v1',
      repair_version: body.repair_version || 'repair-router-v1',
    });
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to rerun regression gate.',
    }, { status: 500 });
  }
}
