import type { RadiantAST } from "../core/types";
import type { RadiantKV } from "../utils/kv";
import { error } from "../core/response";

export class RateLimiter {
  private kv: RadiantKV;
  private schema: RadiantAST;

  constructor(schema: RadiantAST, kv: RadiantKV) {
    this.kv = kv;
    this.schema = schema;
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

  async check(request: Request): Promise<Response | null> {
    const rateLimitConfig = this.schema.security?.rateLimit;
    if (!rateLimitConfig) return null;

    const url = new URL(request.url);
    const method = request.method;
    const isLogin = method === "POST" && (url.pathname.endsWith("/login") || url.pathname.endsWith("/register"));
    const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes(method) && !isLogin;

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

    const windowSec = this.parseWindow(config.window);
    
    // Get client IP
    const clientIP = request.headers.get("x-forwarded-for") || 
                     request.headers.get("x-real-ip") || 
                     "unknown-ip";
    
    const key = `ratelimit:${type}:${clientIP}`;
    const current = await this.kv.get<number>(key) || 0;

    if (current >= config.max) {
      return error("Too Many Requests", 429);
    }

    await this.kv.set(key, current + 1, windowSec);

    return null;
  }
}
