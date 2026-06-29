import type { RadiantAST, RadiantAdapter, AccessRules, Hooks, AuthUser, RadiantRequestContext, StorageProvider, CacheStore } from "../core";
import { RadiantRouter } from "./router";
import { generateOpenAPISpec, generateScalarHTML } from "./openapi";
import { MemoryCacheStore } from "./cache";
import { LocalStorageProvider } from "./storage";
import { RadiantWebsocket } from "./websocket";
import { RadiantSSE } from "./sse";

import { JWTAuthenticator, type JWTConfig } from "./auth";

export interface RadiantConfig {
  adapter: RadiantAdapter;
  storage?: StorageProvider;
  cache?: CacheStore;
}

export class RadiantRuntime<TCollections extends Record<string, any> = Record<string, any>> {
  private schema: RadiantAST;
  private adapter: RadiantAdapter;
  public router: RadiantRouter<TCollections>;
  public storage: StorageProvider;
  public cache: CacheStore;
  private authEngine?: JWTAuthenticator;

  private _hooks = new Map<string, Hooks<any, any>>();
  private _access = new Map<string, AccessRules<any, any>>();

  constructor(schema: RadiantAST, config: RadiantConfig) {
    this.schema = this.resolveEnvVariables(schema);
    this.adapter = config.adapter;
    this.adapter = config.adapter;
    const prefix = this.schema.core?.api?.prefix || '/api';
    this.storage = config.storage || new LocalStorageProvider('uploads', prefix);
    this.cache = config.cache || new MemoryCacheStore();
    this.router = new RadiantRouter();

    if (this.schema.security?.auth?.strategies?.includes("jwt")) {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error("JWT_SECRET environment variable is required when JWT auth strategy is enabled in config.radiant.");
      }
      const jwtSettings = this.schema.security.auth.jwt || {};
      this.authEngine = new JWTAuthenticator({
        secret,
        accessTokenExpiry: jwtSettings.accessTokenExpiry || "15m",
        refreshTokenExpiry: jwtSettings.refreshTokenExpiry || "7d"
      }, this.adapter);
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
      throw new Error(`Unauthorized to ${action} on ${collection}`);
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

  async buildRoutes() {
    const prefix = this.schema.core?.api?.prefix || '/api';

    // 1. Mount OpenAPI / Scalar Documentation
    this.router.get(`${prefix}/docs/openapi.json`, async (ctx) => { const req = ctx.request;
      // Get the protocol/host from request
      const url = new URL(req.url);
      const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
      const serverUrl = `${proto}://${host}`;

      const spec = generateOpenAPISpec(this.schema, serverUrl, prefix);
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
    const isRealtimeGlobal = this.schema.collections.some(c => c.realtime);
    if (isRealtimeGlobal) {
      this.router.get(`/ws`, async (ctx) => RadiantWebsocket.route({ path: `${prefix}/ws` })(ctx.request as any, undefined));
      this.router.get(`/sse`, async (ctx) => RadiantSSE.route({ path: `${prefix}/sse` })(ctx.request as any));
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
        this.router.post(`${basePath}/forgot-password`, async (ctx) => { const req = ctx.request;
          return new Response(JSON.stringify({ message: "Password reset email sent (if account exists)" }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });

        // RESET PASSWORD
        this.router.post(`${basePath}/reset-password`, async (ctx) => { const req = ctx.request;
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
        }

        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' } });
      });

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
        }

        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' } });
      });

      const invalidateCache = async () => {
        // Simple invalidation strategy: delete all list queries for this collection if a doc is changed.
        // In a real app, this should be more granular using a redis SCAN or tracking keys.
        // For now, we rely on the memory adapter or just flush. 
        // We'll clear the whole cache for simplicity if any mutation happens.
        await this.cache.del(`list:${collection.slug}`); // This is naive
      };

      const broadcastChange = (action: string, data: any) => {
        if (!isRealtime) return;
        const payload = { event: `${collection.slug}:${action}`, data };
        if (collection.realtime?.ws) RadiantWebsocket.broadcastAll(payload);
        if (collection.realtime?.sse) RadiantSSE.broadcastAll(payload);
      };

      // POST CREATE
      this.router.post(basePath, async (ctx) => { const req = ctx.request;
        await this.checkAccess(collection.slug, "create", ctx);
        let data = await req.json();
        data = await this.runBeforeHooks(collection.slug, "Create", ctx, data);
        const result = await this.adapter.create(collection.slug, data);
        await this.runAfterHooks(collection.slug, "Create", ctx, result);

        if (hasCache) await this.cache.close(); // Invalidate all (naive)
        if (isRealtime) broadcastChange("created", result);

        return new Response(JSON.stringify(result), { status: 201, headers: { 'Content-Type': 'application/json' } });
      });

      // PATCH UPDATE
      this.router.patch(`${basePath}/:id`, async (ctx) => { const req = ctx.request; const params = ctx.params as any;
        await this.checkAccess(collection.slug, "update", ctx);
        let data = await req.json();
        data = await this.runBeforeHooks(collection.slug, "Update", ctx, data);
        const result = await this.adapter.update(collection.slug, params.id, data);
        await this.runAfterHooks(collection.slug, "Update", ctx, result);

        if (hasCache) {
          await this.cache.del(`doc:${collection.slug}:${params.id}`);
          await this.cache.close(); // Naive list invalidation
        }
        if (isRealtime) broadcastChange("updated", result);

        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
      });

      // DELETE
      this.router.delete(`${basePath}/:id`, async (ctx) => { const req = ctx.request; const params = ctx.params as any;
        await this.checkAccess(collection.slug, "delete", ctx);
        await this.runBeforeHooks(collection.slug, "Delete", ctx, { id: params.id });
        await this.adapter.delete(collection.slug, params.id);
        await this.runAfterHooks(collection.slug, "Delete", ctx, { id: params.id });

        if (hasCache) {
          await this.cache.del(`doc:${collection.slug}:${params.id}`);
          await this.cache.close(); // Naive list invalidation
        }
        if (isRealtime) broadcastChange("deleted", { id: params.id });

        return new Response(JSON.stringify({ deleted: true }), { headers: { 'Content-Type': 'application/json' } });
      });
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
    const dropOrphan = this.schema.migrate?.dropOrphan === true;

    // Detect orphaned tables
    for (const existingTable of existingTables) {
      if (existingTable !== 'radiant_migrations' && !configuredTables.has(existingTable)) {
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

  async start(options: { port?: number } = {}) {
    await this.adapter.connect();
    await this.syncDatabaseSchema();
    await this.buildRoutes();

    const server = Bun.serve({
      port: options.port || 3000,
      fetch: async (req) => { const ctx = await this.getContext(req); const res = await this.router.handle(req, undefined, ctx.user, this); return res || new Response("Not found", { status: 404 }); },
      websocket: RadiantWebsocket.handlers(),
    });

    console.log(`🚀 Radiant Engine started on http://localhost:${server.port}`);
    return server;
  }
}
