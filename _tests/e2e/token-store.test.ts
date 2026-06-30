import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { RadiantRuntime } from "../../runtime/bun/src/main/runtime";
import { PostgresAdapter } from "../../plugins/ts/postgres/src/index";

/**
 * E2E test for the DB-backed refresh token store (Fix 5).
 *
 * Simulates a multi-server deployment by creating two RadiantRuntime
 * instances that share the same Postgres database. A refresh token
 * issued on instance A must be redeemable on instance B, and revocation
 * on one instance must be visible to the other.
 */
describe("E2E: DB-Backed Refresh Token Store (Multi-Instance)", () => {
  let adapterA: PostgresAdapter;
  let adapterB: PostgresAdapter;
  let runtimeA: RadiantRuntime;
  let runtimeB: RadiantRuntime;
  let serverA: any;
  let serverB: any;

  const PG_URL = "postgres://radiant:password@127.0.0.1:5433/radiant_test";

  const schema: any = {
    core: { api: { prefix: "/api" } },
    collections: [
      {
        slug: "users",
        auth: true,
        fields: [
          { name: "email", type: "email" },
          { name: "password", type: "password" },
        ],
      },
    ],
    security: {
      auth: { strategies: ["jwt"] },
    },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = "e2e-token-store-secret";

    // Two separate adapter connections to the same Postgres DB
    adapterA = new PostgresAdapter(PG_URL);
    adapterB = new PostgresAdapter(PG_URL);

    runtimeA = new RadiantRuntime(schema, { adapter: adapterA });
    runtimeB = new RadiantRuntime(schema, { adapter: adapterB });

    // Start both servers on random ports
    serverA = await runtimeA.start({ port: 0 });
    serverB = await runtimeB.start({ port: 0 });

    // Clean up any leftover data from previous runs
    try {
      await (adapterA as any).db?.unsafe("TRUNCATE TABLE users, radiant_refresh_tokens CASCADE");
    } catch {
      // Tables may not exist yet on first run — that's fine
    }
  });

  afterAll(async () => {
    if (serverA) serverA.stop();
    if (serverB) serverB.stop();
  });

  // ---------------------------------------------------------
  // Cross-Instance Token Refresh
  // ---------------------------------------------------------

  test("register on instance A, login on instance A, refresh on instance B", async () => {
    // 1. Register a user on instance A
    const registerRes = await serverA.fetch(
      new Request("http://localhost/api/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "tokenstore-e2e@test.com",
          password: "SecurePassword123",
        }),
      }),
    );
    expect(registerRes.status).toBe(201);
    const registerData = await registerRes.json();
    expect(registerData.refreshToken).toBeDefined();
    expect(registerData.accessToken).toBeDefined();
    const refreshToken = registerData.refreshToken;

    // 2. Use the refresh token on instance B (different process, same DB)
    const refreshRes = await serverB.fetch(
      new Request("http://localhost/api/users/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }),
    );
    expect(refreshRes.status).toBe(200);
    const refreshData = await refreshRes.json();
    expect(refreshData.accessToken).toBeDefined();
    expect(refreshData.refreshToken).toBeDefined();
    // New refresh token should be different from the old one (rotation)
    expect(refreshData.refreshToken).not.toBe(refreshToken);
  });

  test("revocation on instance A is visible on instance B", async () => {
    // 1. Login on instance A to get a fresh token pair
    const loginRes = await serverA.fetch(
      new Request("http://localhost/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "tokenstore-e2e@test.com",
          password: "SecurePassword123",
        }),
      }),
    );
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    const refreshToken = loginData.refreshToken;
    expect(refreshToken).toBeDefined();

    // 2. Logout (revoke) on instance A
    const logoutRes = await serverA.fetch(
      new Request("http://localhost/api/users/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }),
    );
    expect(logoutRes.status).toBe(200);

    // 3. Try to refresh on instance B with the revoked token → should fail
    const refreshRes = await serverB.fetch(
      new Request("http://localhost/api/users/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }),
    );
    expect(refreshRes.status).toBe(401);
  });

  test("revokeAllForUser on instance A invalidates all tokens on instance B", async () => {
    // 1. Login multiple times on instance A (simulating multiple devices)
    const login1 = await serverA.fetch(
      new Request("http://localhost/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "tokenstore-e2e@test.com",
          password: "SecurePassword123",
        }),
      }),
    );
    const data1 = await login1.json();
    const refreshToken1 = data1.refreshToken;

    const login2 = await serverA.fetch(
      new Request("http://localhost/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "tokenstore-e2e@test.com",
          password: "SecurePassword123",
        }),
      }),
    );
    const data2 = await login2.json();
    const refreshToken2 = data2.refreshToken;

    // 2. Trigger password reset to invoke revokeAllForUser internally
    // First, we'll use the forgot-password + reset-password flow.
    // Since we don't have email configured, we'll directly call revokeAllForUser
    // via the auth engine on instance A.
    const userId = data1.user.id;
    await (runtimeA as any).authEngine.revokeAllForUser(userId);

    // 3. Both refresh tokens should now be rejected on instance B
    const refresh1Res = await serverB.fetch(
      new Request("http://localhost/api/users/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refreshToken1 }),
      }),
    );
    expect(refresh1Res.status).toBe(401);

    const refresh2Res = await serverB.fetch(
      new Request("http://localhost/api/users/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: refreshToken2 }),
      }),
    );
    expect(refresh2Res.status).toBe(401);
  });
});