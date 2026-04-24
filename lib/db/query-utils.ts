export function applyLimit<T extends { limit: (count: number) => T }>(query: T, limit = 100) {
  return query.limit(limit);
}
