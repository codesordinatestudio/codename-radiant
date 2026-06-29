import { test, expect, describe, beforeEach, afterEach, setSystemTime } from 'bun:test';
import { JWTAuthenticator } from '../../runtime/bun/src/auth';
import { RadiantAdapter } from '../../runtime/bun/core/types';
import { jwtVerify } from 'jose';

describe('JWTAuthenticator', () => {
  let mockAdapter: RadiantAdapter;
  let authEngine: JWTAuthenticator;
  const SECRET = "very-secure-test-secret-key";

  beforeEach(() => {
    mockAdapter = {
      connect: async () => {},
      create: async () => ({}),
      find: async () => ({ docs: [], total: 0 }),
      findById: async (collection, id) => {
        if (id === 'valid-user') return { id: 'valid-user', email: 'test@example.com', role: 'admin' };
        return null;
      },
      update: async () => ({}),
      delete: async () => {}
    };

    authEngine = new JWTAuthenticator({
      secret: SECRET,
      accessTokenExpiry: "1h",
      refreshTokenExpiry: "7d"
    }, mockAdapter);
  });

  afterEach(() => {
    // We clear timeouts/intervals created inside JWTAuthenticator.
    // Bun's test runner usually handles this but we can force it if needed.
    // authEngine timer is unref'd so it won't block exit.
  });

  test('generateTokenPair creates valid signed JWTs and stores refresh token hash', async () => {
    const user = { id: '123', email: 'user@test.com', role: 'user' };
    const tokens = await authEngine.generateTokenPair(user, 'users');

    expect(tokens.accessToken).toBeDefined();
    expect(tokens.refreshToken).toBeDefined();
    expect(tokens.user.id).toBe('123');

    // Verify access token signature
    const { payload } = await jwtVerify(tokens.accessToken, new TextEncoder().encode(SECRET));
    expect(payload.sub).toBe('123');
    expect(payload.collection).toBe('users');
    expect(payload.role).toBe('user');
  });

  test('verifyAccessToken correctly extracts payload from valid token', async () => {
    const user = { id: '456', email: 'admin@test.com', role: 'admin' };
    const tokens = await authEngine.generateTokenPair(user, 'users');

    const verified = await authEngine.verifyAccessToken(tokens.accessToken);
    expect(verified).toBeDefined();
    expect(verified?.id).toBe('456');
    expect(verified?.role).toBe('admin');
  });

  test('verifyAccessToken returns null for tampered or invalid token', async () => {
    const user = { id: '789' };
    const tokens = await authEngine.generateTokenPair(user, 'users');
    
    const tamperedToken = tokens.accessToken + "tampered";
    const verified = await authEngine.verifyAccessToken(tamperedToken);
    
    expect(verified).toBeNull();
  });

  test('refreshTokenPair issues new tokens and revokes old one', async () => {
    const user = { id: 'valid-user', email: 'test@example.com', role: 'admin' };
    const tokens = await authEngine.generateTokenPair(user, 'users');

    // Refresh using the valid token
    const newTokens = await authEngine.refreshTokenPair(tokens.refreshToken);
    expect(newTokens).toBeDefined();
    expect(newTokens?.accessToken).not.toBe(tokens.accessToken);
    expect(newTokens?.refreshToken).not.toBe(tokens.refreshToken);

    // Try refreshing with the OLD token (should fail because it was rotated/deleted)
    const failedRefresh = await authEngine.refreshTokenPair(tokens.refreshToken);
    expect(failedRefresh).toBeNull();
  });

  test('refreshTokenPair returns null for access token (wrong type)', async () => {
    const user = { id: 'valid-user' };
    const tokens = await authEngine.generateTokenPair(user, 'users');

    // Pass the access token to the refresh method
    const failedRefresh = await authEngine.refreshTokenPair(tokens.accessToken);
    expect(failedRefresh).toBeNull();
  });

  test('revokeRefreshToken permanently revokes a refresh token', async () => {
    const user = { id: 'valid-user' };
    const tokens = await authEngine.generateTokenPair(user, 'users');

    await authEngine.revokeRefreshToken(tokens.refreshToken);

    // Refresh should fail
    const failedRefresh = await authEngine.refreshTokenPair(tokens.refreshToken);
    expect(failedRefresh).toBeNull();
  });

  test('purgeExpiredTokens evicts expired tokens from memory', async () => {
    const user = { id: 'expiring-user' };
    const tokens = await authEngine.generateTokenPair(user, 'users');

    // The token is in memory. Let's fast forward time by 8 days.
    const now = Date.now();
    setSystemTime(new Date(now + 8 * 24 * 60 * 60 * 1000)); // +8 days

    // Call internal purge method
    (authEngine as any).purgeExpiredTokens();

    // The refresh token should no longer be in the store
    const failedRefresh = await authEngine.refreshTokenPair(tokens.refreshToken);
    expect(failedRefresh).toBeNull();
    
    setSystemTime(); // reset clock
  });
});
