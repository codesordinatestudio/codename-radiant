import type { RadiantRuntime } from "../src/runtime";

export interface AuthUser {
  id: string;
  role: string;
  [key: string]: any;
}

export interface RadiantRequestContext<TCollections extends Record<string, any> = any, TState = unknown> {
  request: Request;
  user: AuthUser | null;
  radiant: RadiantRuntime<TCollections>;
  state?: TState;
}

export type AccessControlFunction<TDoc = any, TCollections extends Record<string, any> = any> = (ctx: RadiantRequestContext<TCollections>) => boolean | Promise<boolean>;

export interface AccessRules<TDoc = any, TCollections extends Record<string, any> = any> {
  read?: AccessControlFunction<TDoc, TCollections>;
  create?: AccessControlFunction<TDoc, TCollections>;
  update?: AccessControlFunction<TDoc, TCollections>;
  delete?: AccessControlFunction<TDoc, TCollections>;
}
