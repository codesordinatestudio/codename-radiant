import type { RadiantAST, RadiantAdapter, StorageProvider, CacheStore, RadiantPlugin } from "../core";
import { type DurableStreamStore, MemoryStreamStore } from "../core/stream";
import { validateCreate, validateUpdate } from "../core/validator";
import { RadiantError, toErrorResponse } from "../utils/error";
import type { AccessRules, AuthUser, RadiantRequestContext } from "./access";
import type { Hooks } from "./hooks";
import { RadiantRouter } from "./router";
import { generateOpenAPISpec, generateScalarHTML } from "../core/openapi";
import { MemoryCacheStore } from "../core/cache";
import { LocalStorageProvider } from "../core/storage";
import { CronManager } from "./cron";
import { RadiantWebsocket } from "./websocket";
import { RadiantSSE } from "./sse";
import { setupMonitoring, type RadiantMonitoringAPI } from "../monitoring";
import { RateLimiter } from "../security/rate-limiter";
import { RadiantKV } from "../utils/kv";
import { createMailer, type RadiantMailer } from "../core/email";
import { createLogger } from "../utils/logger";

import { JWTAuthenticator, type JWTConfig } from "../security/auth";
import { AdapterTokenStore, InMemoryTokenStore, type TokenStore } from "../security/token-store";

const log = createLogger("runtime");

export interface RadiantConfig {
  adapter: RadiantAdapter;
  storage?: StorageProvider;
  cache?: CacheStore;
  plugins?: RadiantPlugin[];
  email?: import("../core/types").EmailConfig;
  streamStore?: DurableStreamStore;
}

export class RadiantRuntime<TCollections extends Record<string, any> = Record<string, any>> {
  public schema: RadiantAST;
  public adapter: RadiantAdapter;
  public router: RadiantRouter<TCollections>;
  public rateLimiter: RateLimiter;
  public storage: StorageProvider;
  public cache: CacheStore;
  public plugins: RadiantPlugin[];
  public mailer?: RadiantMailer;
  public streamStore: DurableStreamStore;
  public cronManager = new CronManager();
  public monitoring?: RadiantMonitoringAPI;
  private authEngine?: JWTAuthenticator;

  private _hooks = new Map<string, Hooks<any, any>>();
  private _access = new Map<string, AccessRules<any, any>>();
  private _cacheKeyRegistry = new Map<string, Set<string>>();

  constructor(schema: RadiantAST, config: RadiantConfig) {
    this.schema = this.resolveEnvVariables(schema);
    this.adapter = config.adapter;
    const prefix = this.schema.core?.api?.prefix || '/api';
    this.storage = config.storage || new LocalStorageProvider('uploads', prefix);
    this.cache = config.cache || new MemoryCacheStore();
    this.streamStore = config.streamStore || new MemoryStreamStore();
    this.plugins = config.plugins || [];
    this.router = new RadiantRouter();
    this.rateLimiter = new RateLimiter(this.schema, new RadiantKV());
    if (this.schema.email || config.email) {
      this.mailer = createMailer({
        ...this.schema.email,
        ...config.email
      });
    }
    
    // Setup monitoring endpoints
    this.monitoring = setupMonitoring(this);

    if (this.schema.security?.auth?.strategies?.includes("jwt")) {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw RadiantError.NotConfigured("JWT_SECRET environment variable is required when JWT auth strategy is enabled in config.radiant.");
      }
      const jwtSettings = this.schema.security.auth.jwt || {};
      // Use AdapterTokenStore when the adapter supports system tables (SQL adapters,
      // MongoDB, SurrealDB). Fall back to InMemoryTokenStore for Redis-db which
      // has no system table DDL.
      const tokenStore: TokenStore = this.adapter.getSystemTableStatements
        ? new AdapterTokenStore(this.adapter)
        : new InMemoryTokenStore();
      this.authEngine = new JWTAuthenticator(
        {
          secret,
          accessTokenExpiry: jwtSettings.accessTokenExpiry || "15m",
          refreshTokenExpiry: jwtSettings.refreshTokenExpiry || "7d",
        },
        this.adapter,
        tokenStore,
      );
    }
  }

  access<K extends keyof TCollections>(collection: K, rules: AccessRules<TCollections[K], TCollections>) {
    // @ts-ignore

    this._access.set(collection, rules);
  }

  hooks<K extends keyof TCollections>(collection: K, hooks: Hooks<TCollections[K], TCollections>) {
    // @ts-ignore

    this._hooks.set(collection, hooks);
  }

  private resolveEnvVariables(obj: any): any {
    if (!obj) return obj;
    if (typeof obj === "object") {
      if (Array.isArray(obj)) {
        return obj.map(item => this.resolveEnvVariables(item));
      }
      if (obj.$env !== undefined) {
        const envValue = process.env[obj.$env];
        let finalValue = envValue !== undefined ? envValue : obj.$default;
        // If the default was a number, try casting the env string to a number
        if (typeof obj.$default === "number" && typeof finalValue === "string") {
          const parsed = Number(finalValue);
          if (!isNaN(parsed)) finalValue = parsed;
        } else if (typeof obj.$default === "boolean" && typeof finalValue === "string") {
          if (finalValue.toLowerCase() === "true") finalValue = true;
          else if (finalValue.toLowerCase() === "false") finalValue = false;
        } else if (typeof finalValue === "string") {
          // If no default was provided to infer type from, fallback to direct boolean cast for strings like "true" / "false"
          if (finalValue.toLowerCase() === "true") finalValue = true;
          else if (finalValue.toLowerCase() === "false") finalValue = false;
        }
        return finalValue;
      }
      
      const newObj: any = {};
      for (const key in obj) {
        newObj[key] = this.resolveEnvVariables(obj[key]);
      }
      return newObj;
    }
    return obj;
  }

  private async getContext(req: Request): Promise<RadiantRequestContext> {
    let user: AuthUser | null = null;
    
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ") && this.authEngine) {
      const token = authHeader.split(" ")[1];
      user = await this.authEngine.verifyAccessToken(token);
    }

    return { request: req, user, radiant: this };
  }

  private async checkAccess(collection: string, action: keyof AccessRules, ctx: RadiantRequestContext): Promise<void> {
    const rules = this._access.get(collection);
    if (!rules || !rules[action]) return; // Default allow if no rule defined

    const allowed = await rules[action]!(ctx);
    if (!allowed) {
      throw RadiantError.Forbidden(`Unauthorized to ${action} on ${collection}`);
    }
  }

  private async runBeforeHooks(collection: string, action: "Create" | "Update" | "Delete", ctx: RadiantRequestContext, data: any): Promise<any> {
    const h = this._hooks.get(collection);
    const hookName = `before${action}` as keyof Hooks;
    if (h && h[hookName]) {
      const result = await h[hookName]({ ...ctx, collection, data });
      return result !== undefined ? result : data;
    }
    return data;
  }

  private async runAfterHooks(collection: string, action: "Create" | "Update" | "Delete", ctx: RadiantRequestContext, data: any): Promise<void> {
    const h = this._hooks.get(collection);
    const hookName = `after${action}` as keyof Hooks;
    if (h && h[hookName]) {
      await h[hookName]({ ...ctx, collection, data });
    }
  }

  private _registerCacheKey(collection: string, key: string): void {
    let keys = this._cacheKeyRegistry.get(collection);
    if (!keys) {
      keys = new Set();
      this._cacheKeyRegistry.set(collection, keys);
    }
    keys.add(key);
  }

  async buildRoutes() {
    const prefix = this.schema.core?.api?.prefix || '/api';

    // 1. Mount OpenAPI / Scalar Documentation
    this.router.get(`${prefix}/docs/openapi.json`, async (ctx) => { const req = ctx.request;
      // Get the protocol/host from request
      const url = new URL(req.url);
      const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
      const serverUrl = `${proto}://${host}`;

      const mappedApp = {
        routes: this.router.list().map((route) => ({
          method: route.method,
          path: route.path,
          hooks: {
            body: route.options?.body,
            query: route.options?.query,
            response: route.options?.response,
            detail: route.options?.detail,
          },
        })),
      };

      const spec = generateOpenAPISpec(this.schema, serverUrl, prefix, mappedApp);
      return new Response(JSON.stringify(spec, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    });

    this.router.get(`${prefix}/docs`, () => {
      const specUrl = `${prefix}/docs/openapi.json`;
      const html = generateScalarHTML(specUrl);
      return new Response(html, {
        headers: { "Content-Type": "text/html" }
      });
    });

    // Mount WS and SSE routes
    const isRealtimeGlobal = this.schema.collections.some(c => c.realtime?.ws || c.realtime?.sse || c.realtime?.durableStream);
    if (isRealtimeGlobal) {
      const checkSecureChannel = async (channel: string, request: Request, user: import("./access").AuthUser | null) => {
        const collection = this.schema.collections.find((c: any) => c.slug === channel);
        if (!collection || !collection.realtime?.secure) return true;
        if (!user) return false; // Inherently reject if secure is true but no user is provided

        try {
          const ctx: import("./access").RadiantRequestContext = {
            request,
            user,
            radiant: this as any
          };
          await this.checkAccess(collection.slug, "read", ctx);
          return true;
        } catch {
          return false;
        }
      };

      const onSubscribe = async (info: { request: Request; user: import("./access").AuthUser | null; channel: string }) => {
        return checkSecureChannel(info.channel, info.request, info.user);
      };
      
      const onJoinRoom = async (room: string, ws: import("./websocket").RadiantServerWebSocket) => {
        const req = (ws.data as any).request as Request;
        const user = (ws.data as any).user as import("./access").AuthUser | null;
        if (!req) {
           const collection = this.schema.collections.find(c => c.slug === room);
           if (collection?.realtime?.secure) return false;
           return true;
        }
        return checkSecureChannel(room, req, user);
      };
      
      this.router.get(`${prefix}/ws`, async (ctx) => RadiantWebsocket.route({ path: `${prefix}/ws`, onJoinRoom })(ctx.request as any, undefined));
      this.router.get(`${prefix}/sse`, async (ctx) => RadiantSSE.route({ path: `${prefix}/sse`, onSubscribe })(ctx.request as any));
    }

    // Mount Global Upload Route
    this.router.post(`${prefix}/upload`, async (ctx) => { const req = ctx.request;
      const formData = await req.formData().catch(() => null);
      if (!formData) return new Response(JSON.stringify({ error: "Failed to parse form data" }), { status: 400 });
      
      const file = formData.get("file");
      if (!(file instanceof File)) return new Response(JSON.stringify({ error: "A 'file' field is required" }), { status: 400 });

      const uploadedFile = await this.storage.saveFile(file);
      return new Response(JSON.stringify(uploadedFile), { status: 201, headers: { 'Content-Type': 'application/json' } });
    });

    // Mount Static Uploads Serve
    this.router.get(`${prefix}/uploads/:filename`, async (ctx) => { const req = ctx.request; const params = ctx.params as any;
      const filePath = `${process.cwd()}/uploads/${params.filename}`;
      const file = Bun.file(filePath);
      return new Response(file);
    });

    for (const collection of this.schema.collections) {
      const basePath = `${prefix}/${collection.slug}`;
      const hasCache = !!collection.cache;
      const cacheTTL = collection.cache?.ttl || 3600;
      const isRealtime = !!collection.realtime;

      if (collection.auth) {
        // REGISTER
        this.router.post(`${basePath}/register`, async (ctx) => { const req = ctx.request;
          let data = await req.json();
          if (!data.email || !data.password) return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400 });
          
          const existing = await this.adapter.find(collection.slug, { where: { email: { eq: data.email } }, limit: 1 });
          if (existing.docs.length > 0) return new Response(JSON.stringify({ error: "User already exists" }), { status: 409 });

          const hashedPassword = await Bun.password.hash(data.password, "bcrypt");
          const user = await this.adapter.create(collection.slug, { ...data, password: hashedPassword });
          
          let tokens;
          if (this.authEngine) tokens = await this.authEngine.generateTokenPair(user, collection.slug);
          
          const filteredUser = { ...user };
          delete filteredUser.password;

          return new Response(JSON.stringify({
            user: filteredUser,
            ...(tokens ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } : {}),
            message: "Registration successful"
          }), { status: 201, headers: { 'Content-Type': 'application/json' } });
        });

        // LOGIN
        this.router.post(`${basePath}/login`, async (ctx) => { const req = ctx.request;
          let data = await req.json();
          if (!data.email || !data.password) return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400 });
          
          const result = await this.adapter.find(collection.slug, { where: { email: { eq: data.email } }, limit: 1 });
          const user = result.docs[0];
          if (!user) return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });

          const valid = await Bun.password.verify(data.password, user.password as string);
          if (!valid) return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401 });

          let tokens;
          if (this.authEngine) tokens = await this.authEngine.generateTokenPair(user, collection.slug);
          
          const filteredUser = { ...user };
          delete filteredUser.password;

          return new Response(JSON.stringify({
            user: filteredUser,
            ...(tokens ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken } : {}),
            message: "Login successful"
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });

        // REFRESH
        this.router.post(`${basePath}/refresh`, async (ctx) => { const req = ctx.request;
          let data = await req.json();
          if (!data.refreshToken) return new Response(JSON.stringify({ error: "refreshToken required" }), { status: 400 });
          if (!this.authEngine) return new Response(JSON.stringify({ error: "JWT auth not configured" }), { status: 501 });

          const tokens = await this.authEngine.refreshTokenPair(data.refreshToken);
          if (!tokens) return new Response(JSON.stringify({ error: "Invalid or expired refresh token" }), { status: 401 });

          return new Response(JSON.stringify({
            user: tokens.user,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });

        // LOGOUT
        this.router.post(`${basePath}/logout`, async (ctx) => { const req = ctx.request;
          let data = await req.json();
          if (data.refreshToken && this.authEngine) {
            await this.authEngine.revokeRefreshToken(data.refreshToken);
          }
          return new Response(JSON.stringify({ message: "Logged out successfully" }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });

        // FORGOT PASSWORD
        this.router.post(`${basePath}/forgot-password`, async (ctx) => { 
          const req = ctx.request;
          const data = await req.json();
          if (!data.email) return new Response(JSON.stringify({ error: "Email is required" }), { status: 400, headers: { 'Content-Type': 'application/json' } });

          const existing = await this.adapter.find(collection.slug, { where: { email: { eq: data.email } }, limit: 1 });
          const user = existing.docs[0];

          if (user && this.authEngine && this.mailer) {
            const token = await this.authEngine.generatePasswordResetToken(user.id as string, collection.slug);
            const resetUrl = this.schema.email?.resetPasswordUrl
              ? `${this.schema.email.resetPasswordUrl}?token=${token}`
              : `http://localhost:3000/reset-password?token=${token}`;
            
            await this.mailer.sendForgotPassword(user.email as string, resetUrl);
          }

          // Always return success to prevent email enumeration
          return new Response(JSON.stringify({ message: "Password reset email sent (if account exists)" }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });

        // RESET PASSWORD
        this.router.post(`${basePath}/reset-password`, async (ctx) => { 
          const req = ctx.request;
          const data = await req.json();
          
          if (!data.token || !data.password) {
            return new Response(JSON.stringify({ error: "Token and new password are required" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
          }

          if (!this.authEngine) return new Response(JSON.stringify({ error: "Auth engine not configured" }), { status: 500, headers: { 'Content-Type': 'application/json' } });

          const verified = await this.authEngine.verifyPasswordResetToken(data.token);
          if (!verified || verified.collection !== collection.slug) {
            return new Response(JSON.stringify({ error: "Invalid or expired reset token" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
          }

          const hashedPassword = await Bun.password.hash(data.password, "bcrypt");
          await this.adapter.update(collection.slug, verified.userId, { password: hashedPassword });

          // Invalidate all existing refresh tokens for this user so that
          // sessions on other devices/servers are forced to re-authenticate.
          await this.authEngine.revokeAllForUser(verified.userId);

          // Fetch the user to get their email
          const user = await this.adapter.findById(collection.slug, verified.userId);
          if (user && this.mailer && (user as any).email) {
            await this.mailer.sendPasswordResetSuccess((user as any).email as string);
          }

          return new Response(JSON.stringify({ message: "Password reset successfully" }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });
      }

      // GET LIST
      this.router.get(basePath, async (ctx) => { const req = ctx.request;
        await this.checkAccess(collection.slug, "read", ctx);

        if (hasCache) {
          const cacheKey = `list:${collection.slug}:${new URL(req.url).search}`;
          const cached = await this.cache.get(cacheKey);
          if (cached) return new Response(JSON.stringify(cached), { headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
        }

        const result = await this.adapter.find(collection.slug, {});
        
        if (hasCache) {
          const cacheKey = `list:${collection.slug}:${new URL(req.url).search}`;
          await this.cache.set(cacheKey, result, Number(cacheTTL));
          this._registerCacheKey(collection.slug, cacheKey);
        }

        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' } });
      });

      // GET STREAM
      if (collection.realtime?.durableStream) {
        this.router.get(`${basePath}/stream`, async (ctx) => {
          await this.checkAccess(collection.slug, "read", ctx);
          const url = new URL(ctx.request.url);
          const lastEventId = url.searchParams.get("lastEventId") || undefined;
          const events = await this.streamStore.read(collection.slug, lastEventId);
          return new Response(JSON.stringify(events), { headers: { "Content-Type": "application/json" }});
        });
      }

      // GET ONE
      this.router.get(`${basePath}/:id`, async (ctx) => { const req = ctx.request; const params = ctx.params as any;
        await this.checkAccess(collection.slug, "read", ctx);

        if (hasCache) {
          const cacheKey = `doc:${collection.slug}:${params.id}`;
          const cached = await this.cache.get(cacheKey);
          if (cached) return new Response(JSON.stringify(cached), { headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
        }

        const result = await this.adapter.findById(collection.slug, params.id);
        if (!result) return new Response("Not found", { status: 404 });

        if (hasCache) {
          const cacheKey = `doc:${collection.slug}:${params.id}`;
          await this.cache.set(cacheKey, result, Number(cacheTTL));
          this._registerCacheKey(collection.slug, cacheKey);
        }

        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' } });
      });

      const invalidateCache = async (specificDocId?: string) => {
        // Targeted invalidation: delete only this collection's cache entries.
        if (specificDocId) {
          await this.cache.del(`doc:${collection.slug}:${specificDocId}`);
        }
        const keys = this._cacheKeyRegistry.get(collection.slug);
        if (keys && keys.size > 0) {
          await this.cache.del(...keys);
          keys.clear();
        }
      };

      const broadcastChange = (action: string, data: any) => {
        if (!isRealtime) return;
        const r = collection.realtime;
        const payload = { event: `${collection.slug}:${action}`, data };
        
        const isAllowed = (setting?: boolean | string[]) => 
          setting === true || (Array.isArray(setting) && setting.includes(action));

        if (isAllowed(r?.ws)) RadiantWebsocket.broadcastToRoom(collection.slug, payload);
        if (isAllowed(r?.sse)) RadiantSSE.broadcastToChannel(collection.slug, payload);
        
        if (isAllowed(r?.durableStream) && this.streamStore) {
          this.streamStore.publish(collection.slug, action, data).catch(console.error);
        }
      };



      // POST CREATE
      this.router.post(basePath, async (ctx) => { const req = ctx.request;
        await this.checkAccess(collection.slug, "create", ctx);
        let data = await req.json();
        data = validateCreate(collection, data);
        data = await this.runBeforeHooks(collection.slug, "Create", ctx, data);
        const result = await this.adapter.create(collection.slug, data);
        await this.runAfterHooks(collection.slug, "Create", ctx, result);

        if (hasCache) await invalidateCache();
        if (isRealtime) broadcastChange("created", result);

        return new Response(JSON.stringify(result), { status: 201, headers: { 'Content-Type': 'application/json' } });
      });

      // PATCH UPDATE
      this.router.patch(`${basePath}/:id`, async (ctx) => { const req = ctx.request; const params = ctx.params as any;
        await this.checkAccess(collection.slug, "update", ctx);
        let data = await req.json();
        data = validateUpdate(collection, data);
        data = await this.runBeforeHooks(collection.slug, "Update", ctx, data);
        const result = await this.adapter.update(collection.slug, params.id, data);
        await this.runAfterHooks(collection.slug, "Update", ctx, result);

        if (hasCache) await invalidateCache(params.id);
        if (isRealtime) broadcastChange("updated", result);

        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
      });

      // DELETE
      this.router.delete(`${basePath}/:id`, async (ctx) => { const req = ctx.request; const params = ctx.params as any;
        await this.checkAccess(collection.slug, "delete", ctx);
        await this.runBeforeHooks(collection.slug, "Delete", ctx, { id: params.id });
        await this.adapter.delete(collection.slug, params.id);
        await this.runAfterHooks(collection.slug, "Delete", ctx, { id: params.id });

        if (hasCache) await invalidateCache(params.id);
        if (isRealtime) broadcastChange("deleted", { id: params.id });

        return new Response(JSON.stringify({ deleted: true }), { headers: { 'Content-Type': 'application/json' } });
      });
    }

    if (this.schema.globals) {
      for (const glob of this.schema.globals) {
        const basePath = `${prefix}/globals/${glob.slug}`;

        // GET Global
        this.router.get(basePath, async (ctx) => {
          try {
            await this.checkAccess(glob.slug as any, "read", ctx);
            const data = await this.adapter.findById('radiant_globals', glob.slug);
            return new Response(JSON.stringify(data || {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
          } catch (e: any) {
            return toErrorResponse(e, ctx.request, this.adapter);
          }
        });

        // POST / PATCH Global
        const updateHandler = async (ctx: any) => {
          try {
            await this.checkAccess(glob.slug as any, "update", ctx);
            let body = await ctx.request.json();
            body = await this.runBeforeHooks(glob.slug as any, "Update", ctx, body);
            
            const existing = await this.adapter.findById('radiant_globals', glob.slug);
            
            let result;
            if (existing) {
              result = await this.adapter.update('radiant_globals', glob.slug, body);
            } else {
              result = await this.adapter.create('radiant_globals', { id: glob.slug, ...body });
            }
            
            await this.runAfterHooks(glob.slug as any, "Update", ctx, result);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
          } catch (e: any) {
            return toErrorResponse(e, ctx.request, this.adapter);
          }
        };

        this.router.post(basePath, updateHandler);
        this.router.patch(basePath, updateHandler);
      }
    }
  }

  
  // --- DATABASE LOCAL API ---
  public async find<K extends keyof Omit<TCollections, "__populated">, D extends number = 0>(collection: K, query?: Omit<import("../core/adapter").QueryArgs<TCollections[K]>, "depth"> & { depth?: D }): Promise<import("../core/adapter").PaginatedResult<D extends 0 ? TCollections[K] : "__populated" extends keyof TCollections ? (K extends keyof TCollections["__populated"] ? TCollections["__populated"][K] : TCollections[K]) : TCollections[K]>> {
    return this.adapter.find(collection as string, query as any) as any;
  }

  public async findById<K extends keyof Omit<TCollections, "__populated">, D extends number = 0>(collection: K, id: string, query?: Omit<import("../core/adapter").QueryArgs<TCollections[K]>, "depth"> & { depth?: D }): Promise<(D extends 0 ? TCollections[K] : "__populated" extends keyof TCollections ? (K extends keyof TCollections["__populated"] ? TCollections["__populated"][K] : TCollections[K]) : TCollections[K]) | null> {
    return this.adapter.findById(collection as string, id) as any;
  }

  public async create<K extends keyof TCollections>(collection: K, data: Partial<TCollections[K]>): Promise<TCollections[K]> {
    return this.adapter.create(collection as string, data as any) as Promise<TCollections[K]>;
  }

  public async update<K extends keyof TCollections>(collection: K, id: string, data: Partial<TCollections[K]>): Promise<TCollections[K]> {
    return this.adapter.update(collection as string, id, data as any) as Promise<TCollections[K]>;
  }

  public async delete<K extends keyof TCollections>(collection: K, id: string): Promise<void> {
    return this.adapter.delete(collection as string, id);
  }

  public async count<K extends keyof TCollections>(collection: K, query?: Pick<import("../core/adapter").QueryArgs<TCollections[K]>, "where">): Promise<number> {
    return this.adapter.count(collection as string, query as any);
  }

  async syncDatabaseSchema() {
    if (!this.adapter) return;

    // 1. Init System Tables
    if (this.adapter.getSystemTableStatements && this.adapter.raw) {
      const stmts = this.adapter.getSystemTableStatements();
      for (const stmt of stmts) {
        await this.adapter.raw(stmt);
      }
    }

    // 2. Diff and Sync Collection Tables
    if (!this.adapter.getCurrentSchema || !this.adapter.createTableDDL || !this.adapter.addColumnDDL || !this.adapter.raw) {
      return; // Adapter does not support schema auto-sync
    }

    const currentSchema = await this.adapter.getCurrentSchema();
    const existingTables = new Set(currentSchema.tables);
    const configuredTables = new Set(this.schema.collections.map(c => c.slug));

    const isProduction = process.env.NODE_ENV === "production";
    // dropOrphan is dev-only. In production, auto-sync is always additive
    // (creates tables/columns, never drops). Use `radiant db:sync --force`
    // to apply destructive changes in production.
    const dropOrphan = !isProduction && this.schema.migrate?.dropOrphan === true;

    // Detect orphaned tables
    for (const existingTable of existingTables) {
      if (existingTable !== 'radiant_migrations' && existingTable !== 'radiant_refresh_tokens' && !configuredTables.has(existingTable)) {
        if (dropOrphan) {
          if (this.adapter.dropTableDDL) {
            console.log(`[Radiant Auto-Sync] Dropping orphaned table: ${existingTable}`);
            await this.adapter.raw(this.adapter.dropTableDDL(existingTable));
          }
        } else {
          console.warn(`[Radiant Auto-Sync] Orphaned table detected but not dropped: ${existingTable}`);
        }
      }
    }

    for (const collection of this.schema.collections) {
      const tableName = collection.slug;

      if (!existingTables.has(tableName)) {
        // Table doesn't exist, create it
        const ddl = this.adapter.createTableDDL(collection);
        console.log(`[Radiant Auto-Sync] Creating table: ${tableName}`);
        await this.adapter.raw(ddl);
      } else {
        // Table exists, check for missing columns
        const existingColumnsArray = currentSchema.columns[tableName] || [];
        const existingColumnNames = new Set(existingColumnsArray.map(c => c.split(' ')[0].replace(/"/g, '')));
        const configuredFields = new Set(collection.fields.map(f => f.name));

        // Detect missing columns (in AST, not in DB)
        for (const field of collection.fields) {
          if (!existingColumnNames.has(field.name)) {
            const ddl = this.adapter.addColumnDDL(tableName, field);
            if (ddl) {
              console.log(`[Radiant Auto-Sync] Adding column: ${tableName}.${field.name}`);
              await this.adapter.raw(ddl);
            }
          }
        }

        // Detect orphaned columns (in DB, not in AST)
        for (const colName of existingColumnNames) {
          // Skip system fields
          if (colName === 'id' || colName === 'createdAt' || colName === 'updatedAt') continue;

          if (!configuredFields.has(colName)) {
            if (dropOrphan) {
              if (this.adapter.dropColumnDDL) {
                console.log(`[Radiant Auto-Sync] Dropping orphaned column: ${tableName}.${colName}`);
                await this.adapter.raw(this.adapter.dropColumnDDL(tableName, colName));
              }
            } else {
              console.warn(`[Radiant Auto-Sync] Orphaned column detected but not dropped: ${tableName}.${colName}`);
            }
          }
        }
      }
    }
  }

  /**
   * Schedule a recurring cron job
   * @param name Unique identifier for the job
   * @param schedule Cron expression (e.g. "0 * * * *")
   * @param handler Async function to execute on schedule
   */
  public cron(name: string, schedule: string, handler: (app: RadiantRuntime<TCollections>) => unknown) {
    return this.cronManager.schedule(name, schedule, handler, this);
  }

  public async fetch(req: Request): Promise<Response> {
    // 1. Rate Limit Check (runs before plugins — rate-limited requests
    // should never reach plugin lifecycle hooks)
    const rateLimitResponse = await this.rateLimiter.check(req);
    if (rateLimitResponse) return rateLimitResponse;

    let ctx: RadiantRequestContext | undefined;
    try {
      ctx = await this.getContext(req);
      
      // Run beforeRequest hooks
      for (const plugin of this.plugins) {
        if (plugin.beforeRequest) {
          await plugin.beforeRequest(ctx);
        }
      }

      let res = await this.router.handle(req, undefined, ctx.user, this);
      res = res || new Response("Not found", { status: 404 });

      // Run afterRequest hooks
      for (const plugin of this.plugins) {
        if (plugin.afterRequest) {
          await plugin.afterRequest(ctx, res);
        }
      }

      return res;
    } catch (err: any) {
      if (!ctx) ctx = { request: req, user: null, radiant: this } as RadiantRequestContext;
      
      // Run onError hooks
      for (const plugin of this.plugins) {
        if (plugin.onError) {
          const customRes = await plugin.onError(ctx, err);
          if (customRes instanceof Response) return customRes;
        }
      }
      
      // Use the structured error response builder which checks for
      // RadiantError (correct status/code), database constraint errors
      // (parsed by adapter), and hides internal details in production.
      if (!(err instanceof RadiantError)) {
        log.error({ err }, "Unhandled error in request pipeline");
      }
      return toErrorResponse(err, req, this.adapter);
    }
  }

  async start(options: { port?: number } = {}) {
    if (process.env.NODE_ENV === "production") {
      if (this.cache.constructor.name === "MemoryCacheStore") {
        console.error(
          "\\n\\x1b[41m\\x1b[37m[CRITICAL ERROR] PRODUCTION CACHE GUARDRAIL\\x1b[0m",
          "\\nMemoryCacheStore is configured for a production environment. This is local to the current process and will fail in multi-server deployments.",
          "\\nPlease configure a distributed cache using @codesordinatestudio/radiant-plugin-redis-db for rate limiters and caching.\\n"
        );
        process.exit(1);
      }
    }

    // 1. Run Plugin Initializations
    for (const plugin of this.plugins) {
      if (plugin.onInit) {
        await plugin.onInit(this);
      }
    }

    await this.adapter.connect();
    await this.syncDatabaseSchema();
    await this.buildRoutes();

    const server = Bun.serve({
      port: options.port ?? 3000,
      fetch: async (req) => this.fetch(req),
      websocket: RadiantWebsocket.handlers(),
    });

    // Patch the server's stop method to gracefully tear down background jobs
    const originalStop = server.stop.bind(server);
    server.stop = ((closeActiveConnections?: boolean) => {
      this.cronManager.stopAll();
      return originalStop(closeActiveConnections);
    }) as any;

    const r = "\x1b[38;2;34;211;238m"; // cyan-400
    const w = "\x1b[38;2;255;255;255m"; // white
    const d = "\x1b[38;2;161;161;170m"; // gray-400
    const b = "\x1b[1m"; // bold
    const reset = "\x1b[0m";

    const banner = `
${r}${b}  _____           _ _             _   ${reset}
${r}${b} |  __ \\         | (_)           | |  ${reset}
${r}${b} | |__) |__ _  __| |_  __ _ _ __ | |_ ${reset}
${r}${b} |  _  // _\` |/ _\` | |/ _\` | '_ \\| __|${reset}
${r}${b} | | \\ \\ (_| | (_| | | (_| | | | | |_ ${reset}
${r}${b} |_|  \\_\\__,_|\\__,_|_|\\__,_|_| |_|\\__|${reset}
 
 ${w}✨ Radiant Engine Online${reset}
 ${d}🌍 http://localhost:${server.port}${reset}
`;
    console.log(banner);
    return server;
  }
}
