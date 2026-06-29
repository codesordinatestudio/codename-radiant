import type { AuthUser } from "../main/access";
import type { RadiantRuntime } from "../main/runtime";

export type RadiantQuery = Record<string, any>;
export type RadiantParams = Record<string, string>;

export interface RadiantRouteContext<
  TCollections extends Record<string, any> = any,
  TState = unknown,
  TParams = RadiantParams,
  TQuery = RadiantQuery,
  TBody = unknown,
> {
  request: Request;
  url: URL;
  params: TParams;
  query: TQuery;
  body?: TBody;
  user: AuthUser | null;
  radiant: RadiantRuntime<TCollections>;
  state?: TState;
}

export function parseQuery(searchParams: URLSearchParams): RadiantQuery {
  const query: RadiantQuery = {};

  for (const [key, value] of searchParams) {
    if (key.includes("[")) {
      const parts = key.split(/\[|\]/).filter(Boolean);
      let current = query;

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] === undefined) {
          current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
        }
        current = current[part];
      }

      const last = parts[parts.length - 1];
      if (current[last] !== undefined) {
        if (Array.isArray(current[last])) {
          current[last].push(value);
        } else {
          current[last] = [current[last], value];
        }
      } else {
        current[last] = value;
      }
    } else {
      const existing = query[key];
      if (existing === undefined) {
        query[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        query[key] = [existing, value];
      }
    }
  }

  return query;
}

export function createRouteContext<
  TCollections extends Record<string, any>,
  TState,
  TParams = RadiantParams,
  TQuery = RadiantQuery,
  TBody = unknown,
>(
  request: Request,
  params: TParams = {} as unknown as TParams,
  state?: TState,
  user: AuthUser | null = null,
  body?: TBody,
  radiant?: RadiantRuntime<TCollections>,
): RadiantRouteContext<TCollections, TState, TParams, TQuery, TBody> {
  const url = new URL(request.url);
  return {
    request,
    url,
    params,
    query: parseQuery(url.searchParams) as unknown as TQuery,
    body,
    radiant: radiant as RadiantRuntime<TCollections>,
    user,
    state,
  };
}
