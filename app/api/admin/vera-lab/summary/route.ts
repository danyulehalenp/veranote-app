import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { requireRole } from '@/lib/auth/role-check';
import { getVeraLabDashboardSummary } from '@/lib/db/vera-lab-repo';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

export async function GET(request: Request) {
  void request;

  if (!INTERNAL_MODE_ENABLED) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const authContext = await requireAuth(request);
    requireRole(authContext.user, 'admin');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const summary = await getVeraLabDashboardSummary();
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to load Atlas Lab summary.',
    }, { status: 500 });
  }
}
