type CacheEntry<T> = { value: T; expires: number };

const store = new Map<string, CacheEntry<unknown>>();

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expires > now) {
    return entry.value;
  }
  const value = await fetcher();
  store.set(key, { value, expires: now + ttlSeconds * 1000 });
  return value;
}

export function invalidate(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
