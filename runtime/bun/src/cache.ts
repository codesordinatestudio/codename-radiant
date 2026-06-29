import type { CacheStore } from '../core/types';

export class MemoryCacheStore implements CacheStore {
  private cache = new Map<string, { value: any; expiry: number | null }>();

  async get(key: string): Promise<any | null> {
    const item = this.cache.get(key);
    if (!item) return null;

    if (item.expiry !== null && Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.cache.set(key, { value, expiry });
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.cache.delete(key)) {
        count++;
      }
    }
    return count;
  }

  close(): void {
    this.cache.clear();
  }
}
