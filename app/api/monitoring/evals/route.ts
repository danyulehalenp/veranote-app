import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { requireRole } from '@/lib/auth/role-check';
import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { applyLimit } from '@/lib/db/query-utils';
import { getMetrics } from '@/lib/monitoring/metrics-store';

export async function GET(request: Request) {
  void request;

  try {
    const authContext = await requireAuth(request);
    requireRole(authContext.user, 'admin');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const metrics = getMetrics();

    return NextResponse.json({
      evalHistory: metrics.evals,
      latest: metrics.evals[metrics.evals.length - 1] || null,
    });
  }

  try {
    const { data: evals, error } = await applyLimit(
      supabase
        .from('eval_metrics')
        .select('*')
        .order('timestamp', { ascending: false }),
      100,
    );

    if (error) {
      throw error;
    }

    return NextResponse.json({
      evalHistory: evals || [],
      latest: evals?.[0] || null,
    });
  } catch {
    const metrics = getMetrics();

    return NextResponse.json({
      evalHistory: metrics.evals,
      latest: metrics.evals[metrics.evals.length - 1] || null,
    });
  }
}
