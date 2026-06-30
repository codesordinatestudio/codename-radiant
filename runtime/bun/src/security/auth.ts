import { SignJWT, jwtVerify } from "jose";
import type { RadiantAdapter } from "../core";
import type { AuthUser } from "../main/access";
import { InMemoryTokenStore, type TokenStore } from "./token-store";
import { createLogger } from "../utils/logger";

const log = createLogger("auth");

export interface JWTConfig {
  secret: string;
  issuer?: string;
  audience?: string;
  accessTokenExpiry?: string;
  refreshTokenExpiry?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Deterministic SHA-256 hash (for token/key lookup).
 */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export class JWTAuthenticator {
  private config: JWTConfig;
  private adapter: RadiantAdapter;
  private tokenStore: TokenStore;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(config: JWTConfig, adapter: RadiantAdapter, tokenStore?: TokenStore) {
    this.config = config;
    this.adapter = adapter;
    this.tokenStore = tokenStore ?? new InMemoryTokenStore();
    // Evict expired tokens every 5 minutes
    this.cleanupTimer = setInterval(() => this.tokenStore.purgeExpired(), 5 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  async generateTokenPair(
    user: Record<string, unknown>,
    collection: string
  ): Promise<TokenPair> {
    const userId = user.id as string;
    const role = user.role as string | undefined;

    const secretKey = new TextEncoder().encode(this.config.secret);

    let accessBuilder = new SignJWT({ sub: userId, collection, role })
      .setProtectedHeader({ alg: "HS256" })
      .setJti(generateId())
      .setExpirationTime(this.config.accessTokenExpiry ?? "15m");
    const accessToken = await accessBuilder.sign(secretKey);

    let refreshBuilder = new SignJWT({
      sub: userId,
      collection,
      role,
      type: "refresh",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setJti(generateId())
      .setExpirationTime(this.config.refreshTokenExpiry ?? "7d");
    const refreshToken = await refreshBuilder.sign(secretKey);

    const tokenHash = await sha256(refreshToken);
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7d

    await this.tokenStore.store(tokenHash, { userId, collection, role, expiresAt });

    return {
      accessToken,
      refreshToken,
      user: { id: userId, collection, role, ...user } as any,
    };
  }

  async refreshTokenPair(refreshToken: string): Promise<TokenPair | null> {
    let payload: any;
    try {
      payload = await jwtVerify(
        refreshToken,
        new TextEncoder().encode(this.config.secret)
      );
    } catch {
      // JWT verification failed (expired, tampered, wrong signature) —
      // expected failure, return null without logging.
      return null;
    }

    if (payload.type !== "refresh") return null;

    const tokenHash = await sha256(refreshToken);
    const entry = await this.tokenStore.lookup(tokenHash);
    if (!entry) return null;

    // Rotate: revoke old token, issue a new pair
    await this.tokenStore.revoke(tokenHash);

    try {
      const user = await this.adapter.findById(payload.collection as string, payload.sub as string);
      if (!user) return null;

      return this.generateTokenPair(user, payload.collection as string);
    } catch (err) {
      // Adapter lookup failure is unexpected — log it, don't silently
      // return null which would mask a DB connectivity issue.
      log.error({ err }, "Failed to look up user during refresh token rotation");
      return null;
    }
  }

  async verifyAccessToken(token: string): Promise<AuthUser | null> {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(this.config.secret));
      return {
        id: payload.sub as string,
        collection: payload.collection as string,
        role: payload.role as string,
      };
    } catch {
      return null;
    }
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = await sha256(refreshToken);
    await this.tokenStore.revoke(tokenHash);
  }

  /**
   * Revoke all refresh tokens for a given user (e.g. after password reset/change).
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.tokenStore.revokeAllForUser(userId);
  }

  async generatePasswordResetToken(userId: string, collection: string): Promise<string> {
    const secretKey = new TextEncoder().encode(this.config.secret);
    
    let resetBuilder = new SignJWT({ sub: userId, collection, type: "reset" })
      .setProtectedHeader({ alg: "HS256" })
      .setJti(generateId())
      .setExpirationTime("1h");
    
    return resetBuilder.sign(secretKey);
  }

  async verifyPasswordResetToken(token: string): Promise<{ userId: string, collection: string } | null> {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(this.config.secret));
      if (payload.type !== "reset") return null;
      return {
        userId: payload.sub as string,
        collection: payload.collection as string,
      };
    } catch {
      return null;
    }
  }
}