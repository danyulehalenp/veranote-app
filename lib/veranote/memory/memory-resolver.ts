import { getMemory } from '@/lib/veranote/memory/memory-store';
import type { ProviderMemoryItem, ProviderMemoryResolveContext } from '@/lib/veranote/memory/memory-types';

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function recencyScore(item: ProviderMemoryItem) {
  const updated = new Date(item.updatedAt).getTime();
  return Number.isNaN(updated) ? 0 : updated;
}

function categoryIntentScore(item: ProviderMemoryItem, context: ProviderMemoryResolveContext) {
  const intent = normalize(context.intent || '');

  if (!intent) {
    return 0;
  }

  if (intent === 'workflow_help' && (item.category === 'workflow' || item.category === 'structure')) {
    return 4;
  }

  if (intent === 'draft_support' && (item.category === 'phrasing' || item.category === 'structure' || item.category === 'style')) {
    return 4;
  }

  if (intent === 'reference_help') {
    return 0;
  }

  if (intent === 'clinical_mse_help') {
    return item.category === 'template' ? 1 : 0;
  }

  return item.category === 'template' ? 1 : 2;
}

function tagScore(item: ProviderMemoryItem, context: ProviderMemoryResolveContext) {
  const normalizedTags = new Set((context.tags || []).map(normalize));
  if (context.noteType) {
    normalizedTags.add(normalize(context.noteType));
  }

  return item.tags.reduce((score, tag) => {
    return score + (normalizedTags.has(normalize(tag)) ? 3 : 0);
  }, 0);
}

export async function resolveProviderMemory(providerId: string, context: ProviderMemoryResolveContext) {
  return (await getMemory(providerId))
    .map((item) => ({
      item,
      score: categoryIntentScore(item, context) + tagScore(item, context) + (item.confidence === 'high' ? 3 : item.confidence === 'medium' ? 2 : 1),
      recency: recencyScore(item),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.recency - left.recency;
    })
    .slice(0, 5)
    .map(({ item }) => item);
}
