import { NextResponse } from 'next/server';
import {
  getServerSTTProviderStatuses,
  resolveServerSTTProviderSelection,
} from '@/lib/dictation/server-stt-adapters';
import { getAuthorizedDesktopBridgeContext } from '@/lib/veranote/desktop-bridge-auth';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authorizedProvider = await getAuthorizedDesktopBridgeContext(
    request,
    searchParams.get('providerId') || undefined,
  );
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providers = getServerSTTProviderStatuses();
  const defaultSelection = resolveServerSTTProviderSelection({
    preferRealProvider: true,
    allowMockFallback: true,
  });

  return NextResponse.json({
    providers,
    defaultSelection,
  });
}
