import type { TSchema, Static } from "@sinclair/typebox";
import { TypeCompiler, type TypeCheck } from "@sinclair/typebox/compiler";
import { Value } from "@sinclair/typebox/value";
import { RadiantError, toErrorResponse } from "../utils/error";
import type { RadiantRuntime } from "./runtime";
import type { RadiantAST } from "../core/types";
import type { RadiantRouteContext, RadiantParams, RadiantQuery } from "../core/request";
import { methodNotAllowed, notFound, toResponse, type BunRouteResult } from "../core/response";

export type RadiantRouteHandler<
  TCollections extends Record<string, any> = any,
  TState = unknown,
  TParams extends TSchema | undefined = undefined,
  TQuery extends TSchema | undefined = undefined,
  TBody extends TSchema | undefined = undefined,
  TResponse extends TSchema | undefined = undefined,
> = (
  context: RadiantRouteContext<
    TCollections,
    TState,
    TParams extends TSchema ? Static<TParams> : RadiantParams,
    TQuery extends TSchema ? Static<TQuery> : RadiantQuery,
    TBody extends TSchema ? Static<TBody> : unknown
  >,
) => TResponse extends TSchema
  ? BunRouteResult<Static<TResponse>> | Promise<BunRouteResult<Static<TResponse>>>
  : BunRouteResult | Promise<BunRouteResult>;

export interface RadiantRouteOptions<
  TParams extends TSchema | undefined = undefined,
  TQuery extends TSchema | undefined = undefined,
  TBody extends TSchema | undefined = undefined,
  TResponse extends TSchema | undefined = undefined,
> {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
  response?: TResponse;
  detail?: {
    summary?: string;
    description?: string;
    tags?: string[];
    [key: string]: any;
  };
  /**
   * When true the route requires an authentication credential on every
   * request. Used by plugin guards and admin-only routes that should never
   * accept anonymous callers, regardless of the route handler body.
   */
  authRequired?: boolean;
}

export interface RadiantRoute<
  TCollections extends Record<string, any> = any,
  TState = unknown,
  TParams extends TSchema | undefined = undefined,
  TQuery extends TSchema | undefined = undefined,
  TBody extends TSchema | undefined = undefined,
  TResponse extends TSchema | undefined = undefined,
> {
  method: string;
  path: string;
  handler: RadiantRouteHandler<TCollections, TState, TParams, TQuery, TBody, TResponse>;
  options?: RadiantRouteOptions<TParams, TQuery, TBody, TResponse>;
}

interface CompiledRoute<
  TCollections extends Record<string, any> = any,
  TState = unknown,
  TParams extends TSchema | undefined = undefined,
  TQuery extends TSchema | undefined = undefined,
  TBody extends TSchema | undefined = undefined,
  TResponse extends TSchema | undefined = undefined,
> extends RadiantRoute<TCollections, TState, TParams, TQuery, TBody, TResponse> {
  segments: string[];
  bodyCoercer?: SchemaCoercer;
  queryCoercer?: SchemaCoercer;
  paramsCoercer?: SchemaCoercer;
  shouldReadBody: boolean;
}

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EMPTY_PARAMS = Object.freeze({}) as RadiantParams;
const EMPTY_QUERY = Object.freeze({}) as RadiantQuery;

type NativeBunRequest = Request & {
  params?: RadiantParams;
};

type NativeBunRouteHandler = (
  request: NativeBunRequest,
  server: Bun.Server<unknown> | undefined,
) => Response | undefined | Promise<Response | undefined>;

type SchemaCoercer = (value: unknown) => unknown;
type FastObjectConverter = (value: unknown) => unknown;

export type RadiantNativeRoutes = Record<
  string,
  NativeBunRouteHandler | Partial<Record<string, NativeBunRouteHandler | Response>> | Response | false
>;

export interface RadiantNativeRouteOptions<TState = unknown> {
  state?: TState | ((server?: Bun.Server<unknown>) => TState);
  resolveUser?: (request: Request) => RadiantRouteContext["user"] | Promise<RadiantRouteContext["user"]>;
  onError?: (error: unknown, request: Request) => Response;
  headers?: Record<string, string>;
  cors?: any["cors"];
  /**
   * Server-known set of origins allowed to issue state-changing cookie-
   * authenticated requests. When set, the CSRF guard accepts these origins
   * regardless of Host parsing.
   */
  csrfTrustedOrigins?: string[];
  radiant?: RadiantRuntime;
  monitoring?: any;
  security?: any;
  requestId?: { enabled?: boolean };
  /** Optional rate limiter checked before the route handler runs. */
  rateLimiter?: { check: (request: Request) => Promise<Response | null> | Response | null };
}

function normalizePath(path: string): string {
  if (!path) return "/";
  const prefixed = path.startsWith("/") ? path : `/${path}`;
  if (prefixed.length === 1) return prefixed;
  return prefixed.replace(/\/+$/, "");
}

function splitPath(path: string): string[] {
  const normalized = normalizePath(path);
  if (normalized === "/") return [];
  return normalized.slice(1).split("/");
}

function matchPath<TState>(route: CompiledRoute<any, TState>, pathname: string): RadiantParams | null {
  const requestSegments = splitPath(pathname);
  if (route.segments.length !== requestSegments.length) return null;

  const params: RadiantParams = {};

  for (let i = 0; i < route.segments.length; i++) {
    const expected = route.segments[i];
    const actual = requestSegments[i];

    if (expected.startsWith(":")) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }

    if (expected !== actual) return null;
  }

  return params;
}

function getPathname(url: string): string {
  const protocolIndex = url.indexOf("://");
  const pathStart = protocolIndex === -1 ? 0 : url.indexOf("/", protocolIndex + 3);
  if (pathStart === -1) return "/";

  const queryStart = url.indexOf("?", pathStart);
  return queryStart === -1 ? url.slice(pathStart) : url.slice(pathStart, queryStart);
}

function parseQueryString(url: string): RadiantQuery {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return EMPTY_QUERY;

  const hashStart = url.indexOf("#", queryStart + 1);
  const queryEnd = hashStart === -1 ? url.length : hashStart;
  if (queryEnd <= queryStart + 1) return {};

  const query: RadiantQuery = {};
  let pairStart = queryStart + 1;

  while (pairStart < queryEnd) {
    const ampersand = url.indexOf("&", pairStart);
    const pairEnd = ampersand === -1 || ampersand > queryEnd ? queryEnd : ampersand;
    if (pairEnd === pairStart) {
      pairStart = pairEnd + 1;
      continue;
    }

    const separator = url.indexOf("=", pairStart);
    const valueStart = separator === -1 || separator > pairEnd ? pairEnd : separator + 1;
    const rawKey = separator === -1 || separator > pairEnd
      ? url.slice(pairStart, pairEnd)
      : url.slice(pairStart, separator);
    const rawValue = valueStart === pairEnd ? "" : url.slice(valueStart, pairEnd);
    const key = decodeQueryPart(rawKey);
    const value = decodeQueryPart(rawValue);
    const existing = query[key];

    if (existing === undefined) {
      query[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      query[key] = [existing, value];
    }

    pairStart = pairEnd + 1;
  }

  return query;
}

function decodeQueryPart(value: string): string {
  if (!value.includes("+") && !value.includes("%")) return value;
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function createFastObjectConverter(schema: TSchema): FastObjectConverter | undefined {
  if ((schema as { type?: string }).type !== "object") return undefined;

  const properties = (schema as { properties?: Record<string, { type?: string }> }).properties;
  if (!properties) return undefined;

  const converters: Array<[string, (value: unknown) => unknown]> = [];

  for (const [key, property] of Object.entries(properties)) {
    if (property.type === "string") {
      converters.push([key, (value) => (typeof value === "string" || Array.isArray(value) ? value : String(value))]);
      continue;
    }

    if (property.type === "number") {
      converters.push([
        key,
        (value) => {
          if (typeof value !== "string") return value;
          if (!/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(value)) return value;
          return Number(value);
        },
      ]);
      continue;
    }

    if (property.type === "boolean") {
      converters.push([
        key,
        (value) => {
          if (value === "true" || value === "1") return true;
          if (value === "false" || value === "0") return false;
          return value;
        },
      ]);
      continue;
    }

    return undefined;
  }

  return (value: unknown): unknown => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;

    const converted: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, convert] of converters) {
      if (key in converted) converted[key] = convert(converted[key]);
    }
    return converted;
  };
}

function createSchemaCoercer(schema: TSchema | undefined, label: string): SchemaCoercer | undefined {
  if (!schema) return undefined;
  const check: TypeCheck<TSchema> = TypeCompiler.Compile(schema);
  const fastConvert = createFastObjectConverter(schema);

  return (value: unknown): unknown => {
    if (check.Check(value)) return value;

    const converted = fastConvert?.(value) ?? Value.Convert(schema, value);
    if (check.Check(converted)) return converted;

    const firstError = check.Errors(converted).First();
    const path = firstError?.path ? ` at ${firstError.path}` : "";
    throw RadiantError.BadRequest(`${label} does not match route schema${path}`);
  };
}

function resolveCorsHeaders(origin: string | null, cors: any["cors"] | undefined): Record<string, string> | undefined {
  if (!cors || !origin) return undefined;

  const allowed = cors.origin;
  const allowAny = allowed === "*" || (Array.isArray(allowed) && allowed.includes("*"));
  const allowedOrigins = Array.isArray(allowed) ? allowed : [allowed];
  const allowOrigin = allowAny ? origin : allowedOrigins.includes(origin) ? origin : undefined;
  if (!allowOrigin) return undefined;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    ...(cors.credentials ? { "Access-Control-Allow-Credentials": "true" } : {}),
    Vary: "Origin",
  };
}

function createCorsPreflightResponse(
  request: Request,
  cors: any["cors"] | undefined,
  methods: string[],
  baseHeaders: Record<string, string>,
): Response {
  const corsHeaders = resolveCorsHeaders(request.headers.get("origin"), cors);
  if (!corsHeaders) return new Response(null, { status: 403, headers: baseHeaders });

  const requestedHeaders = request.headers.get("access-control-request-headers");
  return new Response(null, {
    status: 204,
    headers: {
      ...baseHeaders,
      ...corsHeaders,
      "Access-Control-Allow-Methods": [...new Set([...methods, "OPTIONS"])].sort().join(", "),
      "Access-Control-Allow-Headers": requestedHeaders || "Content-Type, Authorization, X-API-Key, X-RADIANT-CSRF, X-CSRF-Token, X-Requested-With",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function readBody(request: Request): Promise<unknown> | unknown {
  if (!request.body) return undefined;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return request.json();
    } catch {
      throw RadiantError.BadRequest("Invalid JSON body");
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    return request.formData().then((formData) => {
      const entries: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
      for (const [key, value] of formData) {
        const existing = entries[key];
        if (existing === undefined) entries[key] = value;
        else if (Array.isArray(existing)) existing.push(value);
        else entries[key] = [existing, value];
      }
      return entries;
    });
  }

  return request.text();
}

function createRouteContext<TState>(
  route: CompiledRoute<any, TState, any, any, any, any>,
  request: Request,
  params: RadiantParams,
  state: TState | undefined,
  user: RadiantRouteContext["user"],
  body: unknown,
  radiant?: RadiantRuntime,
): RadiantRouteContext<any, TState, any, any, any> {
  let url: URL | undefined;
  let parsedQuery: RadiantQuery | undefined;

  let query: RadiantQuery | undefined;
  if (route.queryCoercer) {
    parsedQuery = parseQueryString(request.url);
    query = route.queryCoercer(parsedQuery) as RadiantQuery;
  }

  return {
    request,
    get url() {
      return url ??= new URL(request.url);
    },
    params: (route.paramsCoercer?.(params) ?? params) as RadiantParams,
    get query() {
      if (query !== undefined) return query;
      if (parsedQuery === undefined) parsedQuery = parseQueryString(request.url);
      query = parsedQuery;
      return query;
    },
    body,
    radiant: radiant as RadiantRuntime,
    user,
    state,
  };
}

export class RadiantRouter<TCollections extends Record<string, any> = any, TState = unknown> {
  private routes: CompiledRoute<TCollections, TState, any, any, any, any>[] = [];

  add<
    TParams extends TSchema | undefined = undefined,
    TQuery extends TSchema | undefined = undefined,
    TBody extends TSchema | undefined = undefined,
    TResponse extends TSchema | undefined = undefined,
  >(
    method: string,
    path: string,
    handler: RadiantRouteHandler<TCollections, TState, TParams, TQuery, TBody, TResponse>,
    options?: RadiantRouteOptions<TParams, TQuery, TBody, TResponse>,
  ): this {
    const normalizedPath = normalizePath(path);
    this.routes.push({
      method: method.toUpperCase(),
      path: normalizedPath,
      segments: splitPath(normalizedPath),
      handler: handler as RadiantRouteHandler<TCollections, TState, any, any, any, any>,
      options: options as RadiantRouteOptions<any, any, any, any>,
      bodyCoercer: createSchemaCoercer(options?.body, "Body"),
      queryCoercer: createSchemaCoercer(options?.query, "Query"),
      paramsCoercer: createSchemaCoercer(options?.params, "Params"),
      shouldReadBody: Boolean(options?.body && BODY_METHODS.has(method.toUpperCase())),
    });
    return this;
  }

  get<
    TParams extends TSchema | undefined = undefined,
    TQuery extends TSchema | undefined = undefined,
    TBody extends TSchema | undefined = undefined,
    TResponse extends TSchema | undefined = undefined,
  >(
    path: string,
    handler: RadiantRouteHandler<TCollections, TState, TParams, TQuery, TBody, TResponse>,
    options?: RadiantRouteOptions<TParams, TQuery, TBody, TResponse>,
  ): this {
    return this.add("GET", path, handler, options);
  }

  post<
    TParams extends TSchema | undefined = undefined,
    TQuery extends TSchema | undefined = undefined,
    TBody extends TSchema | undefined = undefined,
    TResponse extends TSchema | undefined = undefined,
  >(
    path: string,
    handler: RadiantRouteHandler<TCollections, TState, TParams, TQuery, TBody, TResponse>,
    options?: RadiantRouteOptions<TParams, TQuery, TBody, TResponse>,
  ): this {
    return this.add("POST", path, handler, options);
  }

  put<
    TParams extends TSchema | undefined = undefined,
    TQuery extends TSchema | undefined = undefined,
    TBody extends TSchema | undefined = undefined,
    TResponse extends TSchema | undefined = undefined,
  >(
    path: string,
    handler: RadiantRouteHandler<TCollections, TState, TParams, TQuery, TBody, TResponse>,
    options?: RadiantRouteOptions<TParams, TQuery, TBody, TResponse>,
  ): this {
    return this.add("PUT", path, handler, options);
  }

  patch<
    TParams extends TSchema | undefined = undefined,
    TQuery extends TSchema | undefined = undefined,
    TBody extends TSchema | undefined = undefined,
    TResponse extends TSchema | undefined = undefined,
  >(
    path: string,
    handler: RadiantRouteHandler<TCollections, TState, TParams, TQuery, TBody, TResponse>,
    options?: RadiantRouteOptions<TParams, TQuery, TBody, TResponse>,
  ): this {
    return this.add("PATCH", path, handler, options);
  }

  delete<
    TParams extends TSchema | undefined = undefined,
    TQuery extends TSchema | undefined = undefined,
    TBody extends TSchema | undefined = undefined,
    TResponse extends TSchema | undefined = undefined,
  >(
    path: string,
    handler: RadiantRouteHandler<TCollections, TState, TParams, TQuery, TBody, TResponse>,
    options?: RadiantRouteOptions<TParams, TQuery, TBody, TResponse>,
  ): this {
    return this.add("DELETE", path, handler, options);
  }

  all<
    TParams extends TSchema | undefined = undefined,
    TQuery extends TSchema | undefined = undefined,
    TBody extends TSchema | undefined = undefined,
    TResponse extends TSchema | undefined = undefined,
  >(
    path: string,
    handler: RadiantRouteHandler<TCollections, TState, TParams, TQuery, TBody, TResponse>,
    options?: RadiantRouteOptions<TParams, TQuery, TBody, TResponse>,
  ): this {
    return this.add("ALL", path, handler, options);
  }

  list(): RadiantRoute<TCollections, TState, any, any, any, any>[] {
    return this.routes.map(({ method, path, handler, options }) => ({ method, path, handler, options }));
  }

  use(routes: RadiantRouter<TCollections, TState> | RadiantRoute<TCollections, TState, any, any, any, any>[] | undefined | null): this {
    if (!routes) return this;
    const routeList = routes instanceof RadiantRouter ? routes.list() : routes;
    for (const route of routeList) {
      this.add(route.method, route.path, route.handler, route.options);
    }
    return this;
  }

  toNativeRoutes(options: RadiantNativeRouteOptions<TState> = {}): RadiantNativeRoutes {
    const nativeRoutes: RadiantNativeRoutes = {};
    const grouped = new Map<string, CompiledRoute<TCollections, TState, any, any, any, any>[]>();
    const headers = Object.entries(options.headers ?? {});
    const hasMonitoring = options.monitoring?.hasHandlers?.() === true;
    const shouldResolveUser = options.resolveUser !== undefined;

    const withHeaders = (response: Response | undefined, extraHeaders?: Record<string, string>): Response | undefined => {
      if (!response) return response;
      if (headers.length === 0 && !extraHeaders) return response;

      if (headers.length > 0) {
        for (let i = 0; i < headers.length; i++) {
          const [key, value] = headers[i];
          if (!response.headers.has(key)) response.headers.set(key, value);
        }
      }

      if (extraHeaders) {
        for (const key in extraHeaders) {
          if (!response.headers.has(key)) response.headers.set(key, extraHeaders[key]);
        }
      }
      return response;
    };
    const requestResponseHeaders = options.cors ? (request: Request, routeHeaders: Record<string, string> | undefined): Record<string, string> | undefined => {
      const origin = request.headers.get("origin");
      const corsHeaders = origin ? resolveCorsHeaders(origin, options.cors) : undefined;
      return corsHeaders ? { ...corsHeaders, ...routeHeaders } : routeHeaders;
    } : (_request: Request, routeHeaders: Record<string, string> | undefined) => routeHeaders;
    const stateCache = new WeakMap<object, TState>();
    let undefinedServerState: TState | undefined;
    let hasUndefinedServerState = false;

    const resolveState: (server?: Bun.Server<unknown>) => TState | undefined = typeof options.state === "function"
      ? (server?: Bun.Server<unknown>): TState | undefined => {
          if (!server) {
            if (!hasUndefinedServerState) {
              undefinedServerState = (options.state as (server?: Bun.Server<unknown>) => TState)(server);
              hasUndefinedServerState = true;
            }
            return undefinedServerState;
          }

          const cached = stateCache.get(server);
          if (cached !== undefined) return cached;

          const state = (options.state as (server?: Bun.Server<unknown>) => TState)(server);
          stateCache.set(server, state);
          return state;
        }
      : () => options.state as TState | undefined;

    for (const route of this.routes) {
      const routes = grouped.get(route.path) ?? [];
      routes.push(route);
      grouped.set(route.path, routes);
    }

    const createHandler = (route: CompiledRoute<TCollections, TState, any, any, any, any>): NativeBunRouteHandler => {
      return (request, server) => {
        const startedAt = hasMonitoring ? performance.now() : 0;
        const pathname = hasMonitoring ? getPathname(request.url) : "";

        // Rate limiting runs before anything else. The rateLimiter will return
        // a synchronous null for requests that don't need rate limiting (e.g., GETs),
        // avoiding any Promise allocation overhead.
        if (options.rateLimiter) {
          const rateResult = options.rateLimiter.check(request);
          if (rateResult instanceof Promise) {
            return rateResult.then((rateRes) => rateRes ?? dispatch());
          }
          if (rateResult) return withHeaders(rateResult, requestResponseHeaders(request, undefined));
        }

        return dispatch();

        function dispatch(): Response | Promise<Response | undefined> | undefined {
        try {
          const runRequest = (requestId: string | undefined): Response | Promise<Response | undefined> | undefined => {
            const requestHeaders: Record<string, string> | undefined = requestId ? { "X-Request-ID": requestId } : undefined;
            const handlerRequest = requestId
              ? new Request(request, {
                  headers: new Headers([...request.headers, ["X-Request-ID", requestId]]),
                })
              : request;

            const processUser = (trust: any): Response | Promise<Response | undefined> | undefined => {
              if (!trust.trusted) {
                const trustError = new RadiantError(trust.reason ?? "Untrusted Request", "UNTRUSTED_REQUEST", 400);
                const response = options.onError ? options.onError(trustError, handlerRequest) : toErrorResponse(trustError, handlerRequest, options.radiant?.adapter);
                return withHeaders(response, requestResponseHeaders(handlerRequest, requestHeaders));
              }

              const method = request.method;
              const isStateChanging = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
              if (isStateChanging) {
                const hasCookie = request.headers.has("cookie");
                if (hasCookie) {
                  const origin = request.headers.get("origin");
                  const referer = request.headers.get("referer");
                  const host = request.headers.get("host");
                  const hasCustomHeader = request.headers.get("x-radiant-csrf") !== null ||
                                          request.headers.get("x-csrf-token") !== null ||
                                          request.headers.get("x-requested-with") !== null;

                  let isSameOrigin = false;
                  if (origin) {
                    try { isSameOrigin = new URL(origin).host === host; } catch {}
                  } else if (referer) {
                    try { isSameOrigin = new URL(referer).host === host; } catch {}
                  }
                  if (!isSameOrigin && origin && Array.isArray(options.csrfTrustedOrigins)) {
                    isSameOrigin = options.csrfTrustedOrigins.includes(origin);
                  }

                  if (!isSameOrigin && !hasCustomHeader) {
                    const csrfError = new RadiantError("CSRF verification failed. Missing secure origin or custom header.", "CSRF_ERROR", 403);
                    const response = options.onError ? options.onError(csrfError, handlerRequest) : toErrorResponse(csrfError, handlerRequest, options.radiant?.adapter);
                    return withHeaders(response, requestResponseHeaders(handlerRequest, requestHeaders));
                  }
                }
              }

              const state = resolveState(server);
              if (options.resolveUser) {
                const userResult = options.resolveUser(handlerRequest);
                if (userResult instanceof Promise) {
                  return userResult.then((user) => processRoute(user, state));
                }
                return processRoute(userResult, state);
              }
              return processRoute(null, state);
            };

            const processRoute = (user: any, state: any): Response | Promise<Response | undefined> | undefined => {
              if (route.options?.authRequired === true && !user) {
                const authError = new RadiantError("Authentication required", "UNAUTHORIZED", 401);
                const response = options.onError ? options.onError(authError, handlerRequest) : toErrorResponse(authError, handlerRequest, options.radiant?.adapter);
                return withHeaders(response, requestResponseHeaders(handlerRequest, requestHeaders));
              }

              if (route.shouldReadBody) {
                const rawBodyResult = readBody(handlerRequest);
                if (rawBodyResult instanceof Promise) {
                  return rawBodyResult.then((rawBody) => {
                    const body = route.bodyCoercer ? route.bodyCoercer(rawBody) : rawBody;
                    return runHandler(user, state, body);
                  });
                }
                const body = route.bodyCoercer ? route.bodyCoercer(rawBodyResult) : rawBodyResult;
                return runHandler(user, state, body);
              }
              return runHandler(user, state, undefined);
            };

            const runHandler = (user: any, state: any, body: any): Response | Promise<Response | undefined> | undefined => {
              const context = createRouteContext(route, handlerRequest, request.params ?? EMPTY_PARAMS, state, user, body, options.radiant);
              let handlerResult: any;
              try {
                handlerResult = route.handler(context);
              } catch (syncErr) {
                // Handler threw synchronously — convert to an error response and
                // emit monitoring events directly here, because a re-throw into an
                // async .then() chain would produce an unhandled rejection.
                const errResponse = options.onError ? options.onError(syncErr, handlerRequest) : toErrorResponse(syncErr, handlerRequest, options.radiant?.adapter);
                if (hasMonitoring && options.monitoring) {
                  const durationMs = Math.round(performance.now() - startedAt);
                  const message = syncErr instanceof Error ? syncErr.message : String(syncErr);
                  const promises: Promise<any>[] = [];
                  const ep1 = options.monitoring.emit({ type: "runtime.error", requestId, method: request.method, path: pathname, status: errResponse.status, durationMs, severity: "error", message, source: "bun", metadata: { route: route.path } });
                  const ep2 = options.monitoring.emit({ type: "request.error", requestId, method: request.method, path: pathname, status: errResponse.status, durationMs, severity: "error", message, source: "bun" });
                  if (ep1 instanceof Promise) promises.push(ep1);
                  if (ep2 instanceof Promise) promises.push(ep2);
                  if (promises.length > 0) {
                    return Promise.all(promises).then(() => withHeaders(errResponse, requestResponseHeaders(handlerRequest, requestHeaders)));
                  }
                }
                return withHeaders(errResponse, requestResponseHeaders(handlerRequest, requestHeaders));
              }
              if (handlerResult instanceof Promise) {
                return handlerResult.then((res) => finish(res, user));
              }
              return finish(handlerResult, user);
            };

            const finish = (resolvedResult: any, user: any): Response | Promise<Response | undefined> | undefined => {
              const response = toResponse(resolvedResult);
              
              if (hasMonitoring && options.monitoring) {
                const durationMs = Math.round(performance.now() - startedAt);
                const promises: Promise<any>[] = [];
                
                const p1 = options.monitoring.emit({
                  type: "request.completed",
                  requestId,
                  method: request.method,
                  path: pathname,
                  status: response?.status,
                  durationMs,
                  userId: user?.id,
                  source: "bun",
                });
                if (p1 instanceof Promise) promises.push(p1);

                const p2 = options.monitoring.emit({
                  type: "trace",
                  requestId,
                  method: request.method,
                  path: pathname,
                  status: response?.status,
                  durationMs,
                  source: "bun",
                  metadata: { route: route.path },
                });
                if (p2 instanceof Promise) promises.push(p2);

                if (response && response.status >= 500) {
                  const p3 = options.monitoring.emit({
                    type: "request.error",
                    requestId,
                    method: request.method,
                    path: pathname,
                    status: response.status,
                    durationMs,
                    severity: "error",
                    source: "bun",
                  });
                  if (p3 instanceof Promise) promises.push(p3);
                }
                
                if (promises.length > 0) {
                  return Promise.all(promises).then(() => withHeaders(response, requestResponseHeaders(handlerRequest, requestHeaders)));
                }
              }
              
              return withHeaders(response, requestResponseHeaders(handlerRequest, requestHeaders));
            };

            if (options.security) {
              const trustResult = options.security.evaluateRequestTrust(handlerRequest);
              if (trustResult instanceof Promise) {
                return trustResult.then(processUser);
              }
              return processUser(trustResult);
            }
            return processUser({ trusted: true });
          };

          if (options.requestId?.enabled === true) {
            const idResult = options.monitoring?.requestId(request);
            if (idResult instanceof Promise) {
              const p = idResult.then(id => runRequest(id ?? crypto.randomUUID()));
              return p.catch(err => {
                const errResponse = options.onError ? options.onError(err, request) : toErrorResponse(err, request, options.radiant?.adapter);
                return withHeaders(errResponse, requestResponseHeaders(request, undefined));
              });
            }
            const res = runRequest(idResult ?? crypto.randomUUID());
            if (res instanceof Promise) {
              return res.catch(err => {
                const errResponse = options.onError ? options.onError(err, request) : toErrorResponse(err, request, options.radiant?.adapter);
                return withHeaders(errResponse, requestResponseHeaders(request, undefined));
              });
            }
            return res;
          }
          const res = runRequest(undefined);
          if (res instanceof Promise) {
            return res.catch(err => {
              const errResponse = options.onError ? options.onError(err, request) : toErrorResponse(err, request, options.radiant?.adapter);
              return withHeaders(errResponse, requestResponseHeaders(request, undefined));
            });
          }
          return res;
          
        } catch (error) {
          const handlerRequest = request;
          const requestHeaders = undefined;
          const requestId = undefined;
          const response = options.onError ? options.onError(error, handlerRequest) : toErrorResponse(error, handlerRequest, options.radiant?.adapter);
          
          if (hasMonitoring && options.monitoring) {
            const durationMs = Math.round(performance.now() - startedAt);
            const message = error instanceof Error ? error.message : String(error);
            const promises: Promise<any>[] = [];
            
            const p1 = options.monitoring.emit({
              type: "runtime.error",
              requestId,
              method: request.method,
              path: pathname,
              status: response.status,
              durationMs,
              severity: "error",
              message,
              source: "bun",
              metadata: { route: route.path },
            });
            if (p1 instanceof Promise) promises.push(p1);

            const p2 = options.monitoring.emit({
              type: "request.error",
              requestId,
              method: request.method,
              path: pathname,
              status: response.status,
              durationMs,
              severity: "error",
              message,
              source: "bun",
            });
            if (p2 instanceof Promise) promises.push(p2);
            
            if (promises.length > 0) {
              return Promise.all(promises).then(() => withHeaders(response, requestResponseHeaders(handlerRequest, requestHeaders)));
            }
          }
          return withHeaders(response, requestResponseHeaders(handlerRequest, requestHeaders));
        }
        } // end dispatch
      };
    };

    for (const [path, routes] of grouped) {
      const allRoute = routes.find((route) => route.method === "ALL");
      if (allRoute) {
        nativeRoutes[path] = createHandler(allRoute);
        continue;
      }

      const methods = routes.map((route) => route.method);
      nativeRoutes[path] = Object.fromEntries(
        routes.map((route) => [route.method, createHandler(route)]),
      );
      if (options.cors && typeof nativeRoutes[path] === "object" && nativeRoutes[path] !== null) {
        (nativeRoutes[path] as Partial<Record<string, NativeBunRouteHandler | Response>>).OPTIONS = (request) =>
          createCorsPreflightResponse(request, options.cors, methods, Object.fromEntries(headers));
      }
    }

    return nativeRoutes;
  }

  async handle(
    request: Request,
    state?: TState,
    user: RadiantRouteContext<any>["user"] = null,
    radiant?: import("./runtime").RadiantRuntime<any>
  ): Promise<Response | undefined> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const allowedMethods = new Set<string>();

    for (const route of this.routes) {
      const params = matchPath(route, url.pathname);
      if (!params) continue;

      if (route.method !== method && route.method !== "ALL") {
        allowedMethods.add(route.method);
        continue;
      }

      const body = route.shouldReadBody ? route.bodyCoercer?.(await readBody(request)) : undefined;
      const context = createRouteContext(route, request, params, state, user, body, radiant);
      return toResponse(await route.handler(context));
    }

    if (allowedMethods.size > 0) {
      return methodNotAllowed([...allowedMethods].sort());
    }

    return notFound();
  }
}

export function createRouter<TCollections extends Record<string, any> = any, TState = unknown>(): RadiantRouter<TCollections, TState> {
  return new RadiantRouter<TCollections, TState>();
}
