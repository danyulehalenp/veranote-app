import { NextResponse } from 'next/server';
import { getConnectivityHealthReport } from '@/lib/veranote/connectivity-health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const report = await getConnectivityHealthReport();

  return NextResponse.json(report, {
    status: report.status === 'critical' ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
