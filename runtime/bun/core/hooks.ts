import type { RadiantRequestContext } from "./access";

export interface HookContext<TCollections extends Record<string, any> = any> extends RadiantRequestContext<TCollections> {
  collection: string;
}

export type HookFunction<T = Record<string, unknown>, TCollections extends Record<string, any> = any> = (
  ctx: HookContext<TCollections> & { data: T }
) => T | Promise<T> | void | Promise<void>;

export interface Hooks<T = Record<string, unknown>, TCollections extends Record<string, any> = any> {
  beforeCreate?: HookFunction<T, TCollections>;
  afterCreate?: HookFunction<T, TCollections>;
  beforeUpdate?: HookFunction<T, TCollections>;
  afterUpdate?: HookFunction<T, TCollections>;
  beforeDelete?: HookFunction<T, TCollections>;
  afterDelete?: HookFunction<T, TCollections>;
}
