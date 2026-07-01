import { test, expect, describe } from 'bun:test';
import { resolveAuditSecret, computeAuditHmac, verifyAuditHmac, verifyAuditChain, type RadiantAuditEvent } from "../../../runtime/bun/src/security/audit";

describe('Unit Tests: Audit Trail Security', () => {
  const dummySchema: any = {
    security: {
      audit: {
        enabled: true,
        secret: "explicit-test-secret"
      }
    }
  };

  const dummyEvent: RadiantAuditEvent = {
    action: "create",
    collection: "users",
    recordId: "usr-123",
    userId: "admin-456",
    metadata: {
      data: { name: "John Doe" }
    }
  };

  test('Should resolve audit secret from schema explicitly', async () => {
    const key = await resolveAuditSecret(dummySchema);
    expect(key).toBeDefined();
    expect(key.algorithm.name).toBe("HMAC");
  });

  test('Should fallback to RADIANT_AUDIT_SECRET if schema has no explicit secret', async () => {
    process.env.RADIANT_AUDIT_SECRET = "env-secret";
    const schemaWithoutExplicit = { security: { audit: { enabled: true } } } as any;
    const key = await resolveAuditSecret(schemaWithoutExplicit);
    expect(key).toBeDefined();
    delete process.env.RADIANT_AUDIT_SECRET;
  });

  test('Should compute HMAC consistently', async () => {
    const key = await resolveAuditSecret(dummySchema);
    const hmac1 = await computeAuditHmac(key, dummyEvent, null);
    const hmac2 = await computeAuditHmac(key, dummyEvent, null);
    expect(hmac1).toBe(hmac2);
    expect(typeof hmac1).toBe("string");
    expect(hmac1.length).toBeGreaterThan(0);
  });

  test('Should yield different HMAC for different previous HMACs', async () => {
    const key = await resolveAuditSecret(dummySchema);
    const hmac1 = await computeAuditHmac(key, dummyEvent, null);
    const hmac2 = await computeAuditHmac(key, dummyEvent, "some-previous-hmac");
    expect(hmac1).not.toBe(hmac2);
  });

  test('Should correctly verify matching HMAC', async () => {
    const key = await resolveAuditSecret(dummySchema);
    const prevHmac = "prev-block-hash";
    const hmac = await computeAuditHmac(key, dummyEvent, prevHmac);
    
    const isValid = await verifyAuditHmac(key, dummyEvent, prevHmac, hmac);
    expect(isValid).toBe(true);
  });

  test('Should reject mismatched HMAC', async () => {
    const key = await resolveAuditSecret(dummySchema);
    const prevHmac = "prev-block-hash";
    const hmac = await computeAuditHmac(key, dummyEvent, prevHmac);
    
    // Attempt verification with tampered data
    const tamperedEvent = { ...dummyEvent, action: "delete" };
    const isValid = await verifyAuditHmac(key, tamperedEvent, prevHmac, hmac);
    expect(isValid).toBe(false);
  });

  test('Should verify complete Audit Chain', async () => {
    const key = await resolveAuditSecret(dummySchema);
    
    const event1: RadiantAuditEvent = { action: "create", collection: "test", recordId: "1" };
    const hmac1 = await computeAuditHmac(key, event1, null);

    const event2: RadiantAuditEvent = { action: "update", collection: "test", recordId: "1" };
    const hmac2 = await computeAuditHmac(key, event2, hmac1);

    const event3: RadiantAuditEvent = { action: "delete", collection: "test", recordId: "1" };
    const hmac3 = await computeAuditHmac(key, event3, hmac2);

    const chain: any[] = [
      { ...event1, hmac: hmac1, prevHmac: null },
      { ...event2, hmac: hmac2, prevHmac: hmac1 },
      { ...event3, hmac: hmac3, prevHmac: hmac2 },
    ];

    const result = await verifyAuditChain(key, chain);
    expect(result.ok).toBe(true);
    expect(result.firstBadIndex).toBeNull();
  });

  test('Should fail chain verification on tampered intermediate link', async () => {
    const key = await resolveAuditSecret(dummySchema);
    
    const event1: RadiantAuditEvent = { action: "create", collection: "test", recordId: "1" };
    const hmac1 = await computeAuditHmac(key, event1, null);

    const event2: RadiantAuditEvent = { action: "update", collection: "test", recordId: "1" };
    const hmac2 = await computeAuditHmac(key, event2, hmac1);

    const event3: RadiantAuditEvent = { action: "delete", collection: "test", recordId: "1" };
    const hmac3 = await computeAuditHmac(key, event3, hmac2);

    const chain: any[] = [
      { ...event1, hmac: hmac1, prevHmac: null },
      // TAMPERED: This row's action is altered to "delete", but hmac is still the one computed for "update"
      { ...event2, action: "delete", hmac: hmac2, prevHmac: hmac1 },
      { ...event3, hmac: hmac3, prevHmac: hmac2 },
    ];

    const result = await verifyAuditChain(key, chain);
    expect(result.ok).toBe(false);
    expect(result.firstBadIndex).toBe(1); // The second link is corrupt
  });
});
