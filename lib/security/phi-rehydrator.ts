import type { PhiEntity } from '@/lib/security/phi-types';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rehydratePHI(text: string, entities: PhiEntity[]) {
  if (!text) {
    return '';
  }

  return entities
    .slice()
    .sort((left, right) => right.placeholder.length - left.placeholder.length)
    .reduce((rehydrated, entity) => {
      return rehydrated.replace(new RegExp(escapeRegExp(entity.placeholder), 'g'), entity.original);
    }, text);
}
