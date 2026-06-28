import type { RadiantRequestContext } from "./access";

export interface HookContext extends RadiantRequestContext {
  collection: string;
}

export type HookFunction<T = Record<string, unknown>> = (
  ctx: HookContext & { data: T }
) => T | Promise<T> | void | Promise<void>;

export interface Hooks<T = Record<string, unknown>> {
  beforeCreate?: HookFunction<T>;
  afterCreate?: HookFunction<T>;
  beforeUpdate?: HookFunction<T>;
  afterUpdate?: HookFunction<T>;
  beforeDelete?: HookFunction<T>;
  afterDelete?: HookFunction<T>;
}
