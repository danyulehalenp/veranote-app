import { deleteProviderMemory, getProviderMemory, saveProviderMemory } from '@/lib/db/memory-repo';
import type { ProviderMemoryItem } from '@/lib/veranote/memory/memory-types';

const providerMemoryStore = new Map<string, ProviderMemoryItem[]>();

function cloneItems(items: ProviderMemoryItem[]) {
  return items.map((item) => ({ ...item, tags: [...item.tags] }));
}

function readBucket(providerId: string) {
  return providerMemoryStore.get(providerId) || [];
}

export async function getMemory(providerId: string) {
  const persistedItems = await getProviderMemory(providerId);
  providerMemoryStore.set(providerId, cloneItems(persistedItems));
  return cloneItems(providerMemoryStore.get(providerId) || []);
}

export async function addMemory(item: ProviderMemoryItem) {
  const bucket = readBucket(item.providerId);
  const nextItem = { ...item, tags: [...item.tags] };
  providerMemoryStore.set(item.providerId, [...bucket, nextItem]);
  await saveProviderMemory(nextItem);
  return nextItem;
}

export async function updateMemory(item: ProviderMemoryItem) {
  const bucket = readBucket(item.providerId);
  const nextItem = { ...item, tags: [...item.tags] };
  const nextBucket = bucket.map((existing) => (existing.id === item.id ? nextItem : existing));
  providerMemoryStore.set(item.providerId, nextBucket);
  await saveProviderMemory(nextItem);
  return nextBucket.find((existing) => existing.id === item.id) || null;
}

export async function deleteMemory(id: string, providerId?: string) {
  if (providerId) {
    const bucket = readBucket(providerId);
    const nextBucket = bucket.filter((item) => item.id !== id);
    providerMemoryStore.set(providerId, nextBucket);
    const deleted = await deleteProviderMemory(id, providerId);
    return bucket.length !== nextBucket.length || deleted;
  }

  for (const [bucketProviderId, bucket] of providerMemoryStore.entries()) {
    const nextBucket = bucket.filter((item) => item.id !== id);
    if (nextBucket.length !== bucket.length) {
      providerMemoryStore.set(bucketProviderId, nextBucket);
      await deleteProviderMemory(id, bucketProviderId);
      return true;
    }
  }

  return deleteProviderMemory(id);
}
