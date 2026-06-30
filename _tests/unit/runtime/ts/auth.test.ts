import { test, expect, describe, beforeEach, afterEach, setSystemTime } from "bun:test";
import { JWTAuthenticator } from "../../../../runtime/bun/src/security/auth";
import { InMemoryTokenStore, AdapterTokenStore, type TokenStore } from "../../../../runtime/bun/src/security/token-store";
import type { RadiantAdapter } from "../../../../runtime/bun/src/core";
import { jwtVerify } from "jose";

describe("JWTAuthenticator", () => {
  let mockAdapter: RadiantAdapter;
  let authEngine: JWTAuthenticator;
  const SECRET = "very-secure-test-secret-key";

  beforeEach(() => {
    mockAdapter = {
      adapterType: "mock",
      connect: async () => {},
      create: async () => ({}),
      find: async () => ({ docs: [], total: 0 }),
      findById: async (collection: string, id: string) => {
        if (id === "valid-user") return { id: "valid-user", email: "test@example.com", role: "admin" };
        return null;
      },
      update: async () => ({}),
      delete: async () => {},
    } as unknown as RadiantAdapter;

    authEngine = new JWTAuthenticator(
      {
        secret: SECRET,
        accessTokenExpiry: "1h",
        refreshTokenExpiry: "7d",
      },
      mockAdapter,
    );
  });

  afterEach(() => {
    // We clear timeouts/intervals created inside JWTAuthenticator.
    // Bun's test runner usually handles this but we can force it if needed.
    // authEngine timer is unref'd so it won't block exit.
  });

  test("generateTokenPair creates valid signed JWTs and stores refresh token hash", async () => {
    const user = { id: "123", email: "user@test.com", role: "user" };
    const tokens = await authEngine.generateTokenPair(user, "users");

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(tokens.user.id).toBe("123");

    // Verify access token signature
    const { payload } = await jwtVerify(tokens.accessToken, new TextEncoder().encode(SECRET));
    expect(payload.sub).toBe("123");
    expect(payload.collection).toBe("users");
    expect(payload.role).toBe("user");
  });

  test("verifyAccessToken correctly extracts payload from valid token", async () => {
    const user = { id: "456", email: "admin@test.com", role: "admin" };
    const tokens = await authEngine.generateTokenPair(user, "users");

    const verified = await authEngine.verifyAccessToken(tokens.accessToken);
    expect(verified).toBeDefined();
    expect(verified?.id).toBe("456");
    expect(verified?.role).toBe("admin");
  });

  test("verifyAccessToken returns null for tampered or invalid token", async () => {
    const user = { id: "789" };
    const tokens = await authEngine.generateTokenPair(user, "users");

    const tamperedToken = tokens.accessToken + "tampered";
    const verified = await authEngine.verifyAccessToken(tamperedToken);

    expect(verified).toBeNull();
  });

  test("refreshTokenPair issues new tokens and revokes old one", async () => {
    const user = { id: "valid-user", email: "test@example.com", role: "admin" };
    const tokens = await authEngine.generateTokenPair(user, "users");

    // Refresh using the valid token
    const newTokens = await authEngine.refreshTokenPair(tokens.refreshToken);
    expect(newTokens).toBeDefined();
    expect(newTokens?.accessToken).not.toBe(tokens.accessToken);
    expect(newTokens?.refreshToken).not.toBe(tokens.refreshToken);

    // Try refreshing with the OLD token (should fail because it was rotated/deleted)
    const failedRefresh = await authEngine.refreshTokenPair(tokens.refreshToken);
    expect(failedRefresh).toBeNull();
  });

  test("refreshTokenPair returns null for access token (wrong type)", async () => {
    const user = { id: "valid-user" };
    const tokens = await authEngine.generateTokenPair(user, "users");

    // Pass the access token to the refresh method
    const failedRefresh = await authEngine.refreshTokenPair(tokens.accessToken);
    expect(failedRefresh).toBeNull();
  });

  test("revokeRefreshToken permanently revokes a refresh token", async () => {
    const user = { id: "valid-user" };
    const tokens = await authEngine.generateTokenPair(user, "users");

    await authEngine.revokeRefreshToken(tokens.refreshToken);

    // Refresh should fail
    const failedRefresh = await authEngine.refreshTokenPair(tokens.refreshToken);
    expect(failedRefresh).toBeNull();
  });

  test("purgeExpiredTokens evicts expired tokens from memory", async () => {
    const user = { id: "expiring-user" };
    const tokens = await authEngine.generateTokenPair(user, "users");

    // The token is in memory. Let's fast forward time by 8 days.
    const now = Date.now();
    setSystemTime(new Date(now + 8 * 24 * 60 * 60 * 1000)); // +8 days

    // Call internal purge method via the token store
    await (authEngine as any).tokenStore.purgeExpired();

    // The refresh token should no longer be in the store
    const failedRefresh = await authEngine.refreshTokenPair(tokens.refreshToken);
    expect(failedRefresh).toBeNull();

    setSystemTime(); // reset clock
  });

  test("revokeAllForUser revokes all refresh tokens for a user", async () => {
    const user = { id: "user-to-revoke", email: "revoke@test.com", role: "user" };

    // Generate multiple token pairs for the same user (simulating multiple devices)
    const tokens1 = await authEngine.generateTokenPair(user, "users");
    const tokens2 = await authEngine.generateTokenPair(user, "users");

    // Both tokens should be valid
    expect(tokens1.refreshToken).toBeDefined();
    expect(tokens2.refreshToken).toBeDefined();

    // Revoke all tokens for this user
    await authEngine.revokeAllForUser("user-to-revoke");

    // Both refresh tokens should now be rejected
    const failedRefresh1 = await authEngine.refreshTokenPair(tokens1.refreshToken);
    const failedRefresh2 = await authEngine.refreshTokenPair(tokens2.refreshToken);
    expect(failedRefresh1).toBeNull();
    expect(failedRefresh2).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────
// AdapterTokenStore tests
// ──────────────────────────────────────────────────────────────

describe("AdapterTokenStore", () => {
  function createMockAdapter(): RadiantAdapter {
    const store = new Map<string, Record<string, unknown>>();

    return {
      adapterType: "mock",
      connect: async () => {},
      create: async (_col: string, data: Record<string, unknown>) => {
        const id = data.id as string;
        store.set(id, { ...data });
        return data;
      },
      find: async (col: string, query: any) => {
        if (col !== "radiant_refresh_tokens") return { docs: [], total: 0 };
        const docs: Record<string, unknown>[] = [];
        for (const [, doc] of store) {
          if (query?.where?.userId?.eq && doc.userId !== query.where.userId.eq) continue;
          if (query?.where?.expiresAt?.lt && (doc.expiresAt as number) >= query.where.expiresAt.lt) continue;
          docs.push(doc);
        }
        return { docs, total: docs.length, limit: 1000, page: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      },
      findById: async (_col: string, id: string) => store.get(id) ?? null,
      update: async (_col: string, id: string, data: Record<string, unknown>) => {
        const existing = store.get(id);
        if (existing) store.set(id, { ...existing, ...data });
        return store.get(id) ?? data;
      },
      delete: async (_col: string, id: string) => { store.delete(id); },
    } as unknown as RadiantAdapter;
  }

  test("store + lookup round-trips a token entry", async () => {
    const adapter = createMockAdapter();
    const tokenStore = new AdapterTokenStore(adapter);

    const entry = { userId: "u1", collection: "users", role: "admin", expiresAt: Date.now() + 100000 };
    await tokenStore.store("hash123", entry);

    const looked = await tokenStore.lookup("hash123");
    expect(looked).not.toBeNull();
    expect(looked?.userId).toBe("u1");
    expect(looked?.collection).toBe("users");
  });

  test("revoke deletes a token entry", async () => {
    const adapter = createMockAdapter();
    const tokenStore = new AdapterTokenStore(adapter);

    await tokenStore.store("hash456", { userId: "u2", collection: "users", expiresAt: Date.now() + 100000 });
    await tokenStore.revoke("hash456");

    const looked = await tokenStore.lookup("hash456");
    expect(looked).toBeNull();
  });

  test("revokeAllForUser removes all tokens for a user", async () => {
    const adapter = createMockAdapter();
    const tokenStore = new AdapterTokenStore(adapter);

    await tokenStore.store("h1", { userId: "userX", collection: "users", expiresAt: Date.now() + 100000 });
    await tokenStore.store("h2", { userId: "userX", collection: "users", expiresAt: Date.now() + 100000 });
    await tokenStore.store("h3", { userId: "userY", collection: "users", expiresAt: Date.now() + 100000 });

    await tokenStore.revokeAllForUser("userX");

    expect(await tokenStore.lookup("h1")).toBeNull();
    expect(await tokenStore.lookup("h2")).toBeNull();
    expect(await tokenStore.lookup("h3")).not.toBeNull();
  });

  test("purgeExpired removes only expired tokens", async () => {
    const adapter = createMockAdapter();
    const tokenStore = new AdapterTokenStore(adapter);

    const now = Date.now();
    await tokenStore.store("expired", { userId: "u", collection: "users", expiresAt: now - 1000 });
    await tokenStore.store("valid", { userId: "u", collection: "users", expiresAt: now + 100000 });

    await tokenStore.purgeExpired();

    expect(await tokenStore.lookup("expired")).toBeNull();
    expect(await tokenStore.lookup("valid")).not.toBeNull();
  });
});