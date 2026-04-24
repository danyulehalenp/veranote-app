const FORBIDDEN_TOP_LEVEL_KEYS = new Set([
  'model',
  'models',
  'system',
  'prompt',
  'promptOverride',
  'messages',
  'tools',
  'toolChoice',
  'temperature',
  'apiKey',
]);

function assertObject(input: unknown): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Malformed request body.');
  }
}

function totalTextLength(value: unknown): number {
  if (typeof value === 'string') {
    return value.length;
  }
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + totalTextLength(item), 0);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, item) => sum + totalTextLength(item), 0);
  }
  return 0;
}

export function validateRequest(input: unknown) {
  assertObject(input);

  for (const key of Object.keys(input)) {
    if (FORBIDDEN_TOP_LEVEL_KEYS.has(key)) {
      throw new Error(`Forbidden request field: ${key}`);
    }
  }

  const totalLength = totalTextLength(input);
  if (totalLength > 120_000) {
    throw new Error('Request body is too large.');
  }

  if (typeof input.message === 'string' && input.message.length > 20_000) {
    throw new Error('Message is too long.');
  }

  if (input.context && typeof input.context === 'object' && !Array.isArray(input.context)) {
    const context = input.context as Record<string, unknown>;
    if (typeof context.currentDraftText === 'string' && context.currentDraftText.length > 60_000) {
      throw new Error('Draft context is too large.');
    }
  }

  if (Array.isArray(input.recentMessages) && input.recentMessages.length > 100) {
    throw new Error('Too many recent messages.');
  }

  return true;
}
