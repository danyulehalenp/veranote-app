export function normalizeSafeCallbackPath(input?: string | null, fallback = '/') {
  const raw = (input || '').trim();
  if (!raw) {
    return fallback;
  }

  if (!raw.startsWith('/')) {
    return fallback;
  }

  if (raw.startsWith('//')) {
    return fallback;
  }

  return raw;
}

