import type { RadiantAST, RadiantAdapter, AccessRules, Hooks, AuthUser, RadiantRequestContext } from "../core";
import { RadiantRouter } from "./router";
import { generateOpenAPISpec, generateScalarHTML } from "./openapi";

export interface RadiantConfig {
  adapter: RadiantAdapter;
}

export class RadiantRuntime<T = any> {
  private schema: RadiantAST;
  private adapter: RadiantAdapter;
  public router: RadiantRouter;

  private _hooks = new Map<string, Hooks>();
  private _access = new Map<string, AccessRules>();

  constructor(schema: RadiantAST, config: RadiantConfig) {
    this.schema = schema;
    this.adapter = config.adapter;
    const prefix = this.schema.core?.api?.prefix || '/api';
    this.router = new RadiantRouter(prefix);
  }

  access(collection: string, rules: AccessRules) {
    this._access.set(collection, rules);
  }

  hooks(collection: string, hooks: Hooks) {
    this._hooks.set(collection, hooks);
  }

  private async getContext(req: Request): Promise<RadiantRequestContext> {
    let user: AuthUser | null = null;
    
    // Naive mock auth for phase 3 testing
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      // In a real app this would verify JWT
      const token = authHeader.split(" ")[1];
      user = { id: "u_123", role: token === "admin-token" ? "admin" : "user" };
    }

    return { request: req, user };
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
    await this.adapter.connect();

    const prefix = this.schema.core?.api?.prefix || '/api';

    // 1. Mount OpenAPI / Scalar Documentation
    this.router.get('/docs/openapi.json', (req) => {
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

    this.router.get('/docs', () => {
      const specUrl = `${prefix}/docs/openapi.json`;
      const html = generateScalarHTML(specUrl);
      return new Response(html, {
        headers: { "Content-Type": "text/html" }
      });
    });

    for (const collection of this.schema.collections) {
      const basePath = `/${collection.slug}`;

      // GET LIST
      this.router.get(basePath, async (req) => {
        const ctx = await this.getContext(req);
        await this.checkAccess(collection.slug, "read", ctx);
        const result = await this.adapter.find(collection.slug, {});
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
      });

      // GET ONE
      this.router.get(`${basePath}/:id`, async (req, params) => {
        const ctx = await this.getContext(req);
        await this.checkAccess(collection.slug, "read", ctx);
        const result = await this.adapter.findById(collection.slug, params.id);
        if (!result) return new Response("Not found", { status: 404 });
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
      });

      // POST CREATE
      this.router.post(basePath, async (req) => {
        const ctx = await this.getContext(req);
        await this.checkAccess(collection.slug, "create", ctx);
        let data = await req.json();
        data = await this.runBeforeHooks(collection.slug, "Create", ctx, data);
        const result = await this.adapter.create(collection.slug, data);
        await this.runAfterHooks(collection.slug, "Create", ctx, result);
        return new Response(JSON.stringify(result), { status: 201, headers: { 'Content-Type': 'application/json' } });
      });

      // PATCH UPDATE
      this.router.patch(`${basePath}/:id`, async (req, params) => {
        const ctx = await this.getContext(req);
        await this.checkAccess(collection.slug, "update", ctx);
        let data = await req.json();
        data = await this.runBeforeHooks(collection.slug, "Update", ctx, data);
        const result = await this.adapter.update(collection.slug, params.id, data);
        await this.runAfterHooks(collection.slug, "Update", ctx, result);
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
      });

      // DELETE
      this.router.delete(`${basePath}/:id`, async (req, params) => {
        const ctx = await this.getContext(req);
        await this.checkAccess(collection.slug, "delete", ctx);
        await this.runBeforeHooks(collection.slug, "Delete", ctx, { id: params.id });
        await this.adapter.delete(collection.slug, params.id);
        await this.runAfterHooks(collection.slug, "Delete", ctx, { id: params.id });
        return new Response(JSON.stringify({ deleted: true }), { headers: { 'Content-Type': 'application/json' } });
      });
    }
  }

  async start(options: { port?: number } = {}) {
    await this.buildRoutes();

    const server = Bun.serve({
      port: options.port || 3000,
      fetch: (req) => this.router.fetch(req),
    });

    console.log(`🚀 Radiant Engine started on http://localhost:${server.port}`);
    return server;
  }
}
