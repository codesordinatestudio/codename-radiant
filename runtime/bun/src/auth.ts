import { SignJWT, jwtVerify } from "jose";
import type { RadiantAdapter, AuthUser } from "../core";

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
  private refreshTokenStore: Map<
    string,
    {
      userId: string;
      collection: string;
      role?: string;
      expiresAt: number;
    }
  > = new Map();
  private cleanupTimer: Timer;

  constructor(config: JWTConfig, adapter: RadiantAdapter) {
    this.config = config;
    this.adapter = adapter;
    // Evict expired in-memory tokens every 5 minutes
    this.cleanupTimer = setInterval(() => this.purgeExpiredTokens(), 5 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  private purgeExpiredTokens(): void {
    const now = Date.now();
    for (const [hash, entry] of this.refreshTokenStore) {
      if (entry.expiresAt <= now) this.refreshTokenStore.delete(hash);
    }
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

    // For now, store in memory. In a DB adapter, this would go into a system table.
    this.refreshTokenStore.set(tokenHash, { userId, collection, role, expiresAt });

    return {
      accessToken,
      refreshToken,
      user: { id: userId, collection, role, ...user } as any,
    };
  }

  async refreshTokenPair(refreshToken: string): Promise<TokenPair | null> {
    try {
      const { payload } = await jwtVerify(
        refreshToken,
        new TextEncoder().encode(this.config.secret)
      );

      if (payload.type !== "refresh") return null;

      const tokenHash = await sha256(refreshToken);
      if (!this.refreshTokenStore.has(tokenHash)) return null;

      // Rotate
      this.refreshTokenStore.delete(tokenHash);

      const user = await this.adapter.findById(payload.collection as string, payload.sub as string);
      if (!user) return null;

      return this.generateTokenPair(user, payload.collection as string);
    } catch {
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
    this.refreshTokenStore.delete(tokenHash);
  }
}
