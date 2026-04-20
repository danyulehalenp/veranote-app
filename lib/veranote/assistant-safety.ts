import type { AssistantResponsePayload } from '@/types/assistant';

function dedupeLines(lines?: string[]) {
  if (!lines?.length) {
    return undefined;
  }

  const seen = new Set<string>();
  const next = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (seen.has(line)) {
        return false;
      }

      seen.add(line);
      return true;
    })
    .slice(0, 4);

  return next.length ? next : undefined;
}

function rewriteActionClaim(message: string, hasActions: boolean) {
  if (!hasActions) {
    return message;
  }

  return message
    .replace(/^I applied\b/i, 'I drafted')
    .replace(/^I updated\b/i, 'I drafted')
    .replace(/^I changed\b/i, 'I drafted')
    .replace(/^I added\b/i, 'I drafted')
    .replace(/^I sent\b/i, 'I prepared')
    .replace(/^I placed\b/i, 'I drafted');
}

export function applyAssistantSafety(payload: AssistantResponsePayload): AssistantResponsePayload {
  const message = payload.message?.trim() || 'I can help once you send a little more detail.';
  const hasActions = Boolean(payload.actions?.length);

  return {
    ...payload,
    message: rewriteActionClaim(message, hasActions),
    suggestions: dedupeLines(payload.suggestions),
  };
}
