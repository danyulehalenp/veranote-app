import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { requireRole } from '@/lib/auth/role-check';
import { reviewVeraFixTask } from '@/lib/db/vera-lab-repo';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!INTERNAL_MODE_ENABLED) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let authContext;
  try {
    authContext = await requireAuth(request);
    requireRole(authContext.user, 'admin');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { status?: 'approved' | 'rejected' } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body.status !== 'approved' && body.status !== 'rejected') {
    return NextResponse.json({ error: 'Invalid approval state.' }, { status: 400 });
  }

  try {
    const params = await context.params;
    const actor = (authContext.user as { email?: string | null; id?: string | null }).email
      || (authContext.user as { email?: string | null; id?: string | null }).id
      || 'admin-reviewer';
    const task = await reviewVeraFixTask(params.id, {
      status: body.status,
      actor,
    });
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to update fix-task approval state.',
    }, { status: 500 });
  }
}
