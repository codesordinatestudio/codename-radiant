export type SerializableResponseBody =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | unknown[];

export const UPGRADED = Symbol("radiant.bun.upgraded");

export type BunRouteResult<T = SerializableResponseBody> = Response | T | typeof UPGRADED;

const JSON_CONTENT_TYPE = "application/json";
const DEFAULT_JSON_HEADERS = { "Content-Type": JSON_CONTENT_TYPE };

function mergeHeaders(init?: ResponseInit, headers?: HeadersInit): Headers {
  const merged = new Headers(init?.headers);
  if (headers) {
    for (const [key, value] of new Headers(headers)) {
      merged.set(key, value);
    }
  }
  return merged;
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  if (!init.headers && init.status === undefined && init.statusText === undefined) {
    return new Response(JSON.stringify(data), { headers: DEFAULT_JSON_HEADERS });
  }

  const headers = mergeHeaders(init, { "Content-Type": JSON_CONTENT_TYPE });
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function empty(status = 204, init: ResponseInit = {}): Response {
  return new Response(null, { ...init, status });
}

export function redirect(location: string, status = 302, init: ResponseInit = {}): Response {
  const headers = mergeHeaders(init, { Location: location });
  return new Response(null, { ...init, status, headers });
}

export function error(message: string, status = 500, code = "INTERNAL_ERROR", init: ResponseInit = {}): Response {
  return json(
    {
      error: code,
      message,
    },
    { ...init, status },
  );
}

export function notFound(message = "Not found"): Response {
  return error(message, 404, "NOT_FOUND");
}

export function methodNotAllowed(allowedMethods: string[]): Response {
  return error("Method not allowed", 405, "METHOD_NOT_ALLOWED", {
    headers: { Allow: allowedMethods.join(", ") },
  });
}

export function file(file: Blob | ArrayBuffer | Uint8Array | string, init: ResponseInit = {}): Response {
  if (typeof file === "string") {
    return new Response(Bun.file(file), init);
  }
  if (file instanceof Uint8Array) {
    return new Response(new Uint8Array(file).buffer, init);
  }
  return new Response(file, init);
}

export function toResponse(result: BunRouteResult): Response | undefined {
  if (result === UPGRADED) return undefined;
  if (result instanceof Response) return result;
  if (result === undefined) return empty();
  if (typeof result === "string") return new Response(result);
  return json(result);
}

export function routeErrorToResponse(errorValue: unknown, request?: Request): Response {
  console.error("Radiant Unhandled Route Error:", errorValue);
  const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
  return error(message, 500, "INTERNAL_ERROR", {
    headers: request ? { "X-Radiant-Path": new URL(request.url).pathname } : undefined,
  });
}
