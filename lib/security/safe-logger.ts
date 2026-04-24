import { sanitizePHI } from '@/lib/security/phi-sanitizer';

type SafeLogEvent = {
  timestamp?: string;
  route: string;
  action?: string;
  model?: string;
  latencyMs?: number;
  tokenUsage?: number | {
    prompt?: number;
    completion?: number;
    total?: number;
  };
  userId?: string;
  status?: number;
  outcome?: 'success' | 'error' | 'rejected';
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

function sanitizeMetadata(metadata?: SafeLogEvent['metadata']) {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return [key, sanitizePHI(value).sanitizedText];
        }
        return [key, value];
      }),
  );
}

export function logEvent(event: SafeLogEvent) {
  const entry = {
    timestamp: event.timestamp || new Date().toISOString(),
    route: sanitizePHI(event.route).sanitizedText,
    ...(event.action ? { action: sanitizePHI(event.action).sanitizedText } : {}),
    ...(event.model ? { model: sanitizePHI(event.model).sanitizedText } : {}),
    ...(event.userId ? { userId: sanitizePHI(event.userId).sanitizedText } : {}),
    ...(typeof event.status === 'number' ? { status: event.status } : {}),
    ...(typeof event.latencyMs === 'number' ? { latencyMs: event.latencyMs } : {}),
    ...(event.outcome ? { outcome: event.outcome } : {}),
    ...(event.tokenUsage ? { tokenUsage: event.tokenUsage } : {}),
    ...(event.metadata ? { metadata: sanitizeMetadata(event.metadata) } : {}),
  };

  console.info('[veranote-safe-log]', entry);
  return entry;
}
