import type { RadiantAST } from "../core/types";
import type { RadiantKV } from "../utils/kv";
import { error } from "../core/response";

export class RateLimiter {
  private kv: RadiantKV;
  private schema: RadiantAST;
  private hasRateLimit: boolean;

  constructor(schema: RadiantAST, kv: RadiantKV) {
    this.kv = kv;
    this.schema = schema;
    this.hasRateLimit = !!schema.security?.rateLimit;
  }

  private parseWindow(windowStr?: string): number {
    let windowSec = 60; // default 1m
    if (windowStr) {
      const match = windowStr.match(/^(\d+)([smhd])$/);
      if (match) {
        const val = parseInt(match[1]);
        const unit = match[2];
        if (unit === 's') windowSec = val;
        else if (unit === 'm') windowSec = val * 60;
        else if (unit === 'h') windowSec = val * 3600;
        else if (unit === 'd') windowSec = val * 86400;
      }
    }
    return windowSec;
  }

  /**
   * Extract the pathname from a URL string without allocating a URL object.
   */
  private getPathname(url: string): string {
    const protocolIndex = url.indexOf("://");
    const pathStart = protocolIndex === -1 ? 0 : url.indexOf("/", protocolIndex + 3);
    if (pathStart === -1) return "/";
    const queryStart = url.indexOf("?", pathStart);
    return queryStart === -1 ? url.slice(pathStart) : url.slice(pathStart, queryStart);
  }

  check(request: Request): Promise<Response | null> | Response | null {
    if (!this.hasRateLimit) return null;

    const rateLimitConfig = this.schema.security!.rateLimit!;
    const method = request.method;
    const pathname = this.getPathname(request.url);
    const isLogin = method === "POST" && (pathname.endsWith("/login") || pathname.endsWith("/register"));
    const isWrite = (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") && !isLogin;

    let config: { max?: number; window?: string } | undefined;
    let type = "";

    if (isLogin && rateLimitConfig.login) {
      config = rateLimitConfig.login;
      type = "login";
    } else if (isWrite && rateLimitConfig.write) {
      config = rateLimitConfig.write;
      type = "write";
    }

    if (!config || !config.max) return null;

    // Allow env override of the max threshold (e.g. for benchmarks or
    // high-throughpute deployments). Set RATE_LIMIT_MAX to raise the cap
    // without disabling rate limiting entirely.
    const envMax = Number(globalThis.process?.env?.RATE_LIMIT_MAX);
    if (!Number.isNaN(envMax) && envMax > 0) {
      config = { ...config, max: Math.max(config.max, envMax) };
    }

    const windowSec = this.parseWindow(config.window);
    
    // Get client IP
    const clientIP = request.headers.get("x-forwarded-for") || 
                     request.headers.get("x-real-ip") || 
                     "unknown-ip";
    
    const key = `ratelimit:${type}:${clientIP}`;
    return this._doCheckAsync(key, config.max!, windowSec);
  }

  private async _doCheckAsync(key: string, max: number, windowSec: number): Promise<Response | null> {
    const current = await this.kv.get<number>(key) || 0;

    if (current >= max) {
      return error("Too Many Requests", 429);
    }

    await this.kv.set(key, current + 1, windowSec);

    return null;
  }
}