import type { RadiantAST } from "../core/types";

export interface RadiantAuditEvent {
  action: string;
  collection?: string;
  recordId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntry extends RadiantAuditEvent {
  id?: string;
  hmac: string;
  prevHmac: string | null;
  createdAt?: string;
}

const AUDIT_HKDF_LABEL = "radiant-audit-v1";

/**
 * Resolves the audit HMAC key. Precedence:
 *   1. `config.security.audit.secret` (explicit operator override)
 *   2. `RADIANT_AUDIT_SECRET` environment variable
 *   3. HKDF-SHA256 derivation from `JWT_SECRET`
 */
export async function resolveAuditSecret(config: RadiantAST): Promise<CryptoKey> {
  const explicit = config.security?.audit?.secret ?? process.env.RADIANT_AUDIT_SECRET;
  const baseKey = explicit ?? process.env.JWT_SECRET ?? "";

  if (!baseKey) {
    throw new Error("Audit secret could not be resolved: provide audit.secret, RADIANT_AUDIT_SECRET, or JWT_SECRET.");
  }

  if (explicit) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(explicit), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
  }

  const ikm = await crypto.subtle.importKey("raw", new TextEncoder().encode(baseKey), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: new TextEncoder().encode(AUDIT_HKDF_LABEL) },
    ikm,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Canonicalises an audit event into a stable string for HMAC input.
 */
function canonicalAuditPayload(event: RadiantAuditEvent, prevHmac: string | null): string {
  return JSON.stringify({
    action: event.action,
    collection: event.collection ?? null,
    recordId: event.recordId ?? null,
    userId: event.userId ?? null,
    metadata: event.metadata ?? {},
    prevHmac,
  });
}

/**
 * Computes the HMAC-SHA256 over `canonical(payload) + prevHmac`.
 */
export async function computeAuditHmac(
  key: CryptoKey,
  event: RadiantAuditEvent,
  prevHmac: string | null,
): Promise<string> {
  const data = new TextEncoder().encode(canonicalAuditPayload(event, prevHmac));
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return Buffer.from(new Uint8Array(sig)).toString("hex");
}

/**
 * Verifies an HMAC against an event + previous HMAC.
 */
export async function verifyAuditHmac(
  key: CryptoKey,
  event: RadiantAuditEvent,
  prevHmac: string | null,
  storedHmac: string,
): Promise<boolean> {
  const expected = await computeAuditHmac(key, event, prevHmac);
  if (expected.length !== storedHmac.length) return false;
  // Constant-time compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ storedHmac.charCodeAt(i);
  return diff === 0;
}

/**
 * Walks an ordered list of audit entries and returns the index of the first
 * entry whose HMAC does not validate against the chain (or null if clean).
 */
export async function verifyAuditChain(
  key: CryptoKey,
  entries: AuditLogEntry[],
): Promise<{ ok: boolean; firstBadIndex: number | null }> {
  let prevHmac: string | null = null;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const ok = await verifyAuditHmac(
      key,
      { action: entry.action, collection: entry.collection, recordId: entry.recordId, userId: entry.userId, metadata: entry.metadata },
      prevHmac,
      entry.hmac,
    );
    if (!ok) return { ok: false, firstBadIndex: i };
    prevHmac = entry.hmac;
  }
  return { ok: true, firstBadIndex: null };
}
