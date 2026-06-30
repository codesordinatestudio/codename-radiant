import type { RadiantAdapter } from "../core";

/**
 * A persisted entry for a refresh token.
 * The hash is the SHA-256 of the raw refresh JWT string.
 */
export interface RefreshTokenEntry {
  userId: string;
  collection: string;
  role?: string;
  expiresAt: number; // epoch ms
}

/**
 * Abstraction over where refresh tokens are stored.
 *
 * - `InMemoryTokenStore` — process-local Map (dev / single-instance).
 * - `AdapterTokenStore`  — persisted via the RadiantAdapter in a
 *   `radiant_refresh_tokens` system table (multi-instance / production).
 *
 * Every method takes the token *hash* (SHA-256 hex), never the raw token.
 */
export interface TokenStore {
  store(hash: string, entry: RefreshTokenEntry): Promise<void>;
  lookup(hash: string): Promise<RefreshTokenEntry | null>;
  revoke(hash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  purgeExpired(): Promise<void>;
}

// ──────────────────────────────────────────────────────────────
// InMemoryTokenStore
// ──────────────────────────────────────────────────────────────

export class InMemoryTokenStore implements TokenStore {
  private store_ = new Map<string, RefreshTokenEntry>();

  async store(hash: string, entry: RefreshTokenEntry): Promise<void> {
    this.store_.set(hash, entry);
  }

  async lookup(hash: string): Promise<RefreshTokenEntry | null> {
    return this.store_.get(hash) ?? null;
  }

  async revoke(hash: string): Promise<void> {
    this.store_.delete(hash);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const [hash, entry] of this.store_) {
      if (entry.userId === userId) this.store_.delete(hash);
    }
  }

  async purgeExpired(): Promise<void> {
    const now = Date.now();
    for (const [hash, entry] of this.store_) {
      if (entry.expiresAt <= now) this.store_.delete(hash);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// AdapterTokenStore
// ──────────────────────────────────────────────────────────────

/**
 * System collection/table name used by AdapterTokenStore.
 */
export const REFRESH_TOKEN_COLLECTION = "radiant_refresh_tokens";

/**
 * Persists refresh tokens through the RadiantAdapter so they survive
 * process restarts and are visible across multiple server instances.
 *
 * Each token is stored as a document whose `id` is the token hash.
 * This works across SQL adapters (Postgres, SQLite), MongoDB, Redis,
 * and SurrealDB — all of which expose the same `create / findById /
 * find / delete` contract.
 */
export class AdapterTokenStore implements TokenStore {
  constructor(private adapter: RadiantAdapter) {}

  async store(hash: string, entry: RefreshTokenEntry): Promise<void> {
    const doc: Record<string, unknown> = {
      id: hash,
      tokenHash: hash,
      userId: entry.userId,
      collection: entry.collection,
      role: entry.role,
      expiresAt: entry.expiresAt,
    };

    // Upsert: if the hash already exists, update it; otherwise create.
    try {
      const existing = await this.adapter.findById(REFRESH_TOKEN_COLLECTION, hash);
      if (existing) {
        await this.adapter.update(REFRESH_TOKEN_COLLECTION, hash, {
          userId: entry.userId,
          collection: entry.collection,
          role: entry.role,
          expiresAt: entry.expiresAt,
        });
      } else {
        await this.adapter.create(REFRESH_TOKEN_COLLECTION, doc);
      }
    } catch {
      // If the system table doesn't exist yet (e.g. before first sync),
      // the create will throw — fall back silently. The token will still
      // be valid for the lifetime of the JWT itself; it just won't be
      // revocable until the table is created.
    }
  }

  async lookup(hash: string): Promise<RefreshTokenEntry | null> {
    try {
      const doc = await this.adapter.findById(REFRESH_TOKEN_COLLECTION, hash);
      if (!doc) return null;
      return {
        userId: doc.userId as string,
        collection: doc.collection as string,
        role: doc.role as string | undefined,
        expiresAt: doc.expiresAt as number,
      };
    } catch {
      return null;
    }
  }

  async revoke(hash: string): Promise<void> {
    try {
      await this.adapter.delete(REFRESH_TOKEN_COLLECTION, hash);
    } catch {
      // Table may not exist yet — nothing to revoke.
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    try {
      const result = await this.adapter.find(REFRESH_TOKEN_COLLECTION, {
        where: { userId: { eq: userId } },
        limit: 1000,
      });
      for (const doc of result.docs) {
        await this.adapter.delete(REFRESH_TOKEN_COLLECTION, doc.id as string);
      }
    } catch {
      // Table may not exist yet — nothing to revoke.
    }
  }

  async purgeExpired(): Promise<void> {
    const now = Date.now();
    try {
      const result = await this.adapter.find(REFRESH_TOKEN_COLLECTION, {
        where: { expiresAt: { lt: now } },
        limit: 1000,
      });
      for (const doc of result.docs) {
        await this.adapter.delete(REFRESH_TOKEN_COLLECTION, doc.id as string);
      }
    } catch {
      // Table may not exist yet — nothing to purge.
    }
  }
}