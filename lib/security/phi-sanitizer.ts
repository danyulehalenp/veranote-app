import { detectPHI } from '@/lib/security/phi-detector';
import type { PhiEntity, PhiSanitizationResult } from '@/lib/security/phi-types';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function applyPhiEntities(text: string, entities: PhiEntity[]) {
  if (!text) {
    return '';
  }

  return entities
    .slice()
    .sort((left, right) => right.original.length - left.original.length)
    .reduce((sanitized, entity) => {
      return sanitized.replace(new RegExp(escapeRegExp(entity.original), 'g'), entity.placeholder);
    }, text);
}

export function sanitizePHITexts(texts: string[]) {
  const entities = detectPHI(texts.filter(Boolean).join('\n\n'));
  return {
    sanitizedTexts: texts.map((text) => applyPhiEntities(text, entities)),
    entities,
  };
}

export function sanitizePHI(text: string): PhiSanitizationResult {
  const { sanitizedTexts, entities } = sanitizePHITexts([text]);
  return {
    sanitizedText: sanitizedTexts[0] || '',
    entities,
  };
}

export function sanitizeForLogging(text: string) {
  return sanitizePHI(text).sanitizedText;
}
