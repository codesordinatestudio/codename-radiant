import { defineDatabasePlugin, type LucentDatabasePluginConfig } from "@codesordinatestudio/lucent-core";
import { RedisAdapter } from "./adapter";

export type RedisPluginOptions = {
  url: string;
  prefix?: string;
}

export type RedisPluginConfig = LucentDatabasePluginConfig<RedisPluginOptions>;

export function redisDB(options: RedisPluginOptions): RedisPluginConfig {
  return defineDatabasePlugin({
    type: "redis",
    options,
    createAdapter() {
      return new RedisAdapter(options.url, options.prefix);
    },
  });
}

export { RedisAdapter };
