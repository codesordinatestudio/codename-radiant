import { defineDatabasePlugin, type LucentDatabasePluginConfig } from "@codesordinatestudio/lucent-core";
import { SurrealDBAdapter } from "./adapter";

export type SurrealDBPluginOptions = {
  url: string;
  namespace?: string;
  database?: string;
  auth?: {
    username: string;
    password: string;
  };
}

export type SurrealDBPluginConfig = LucentDatabasePluginConfig<SurrealDBPluginOptions>;

export function surrealdb(options: SurrealDBPluginOptions): SurrealDBPluginConfig {
  return defineDatabasePlugin({
    type: "surrealdb",
    options,
    createAdapter() {
      return new SurrealDBAdapter(options);
    },
  });
}

export { SurrealDBAdapter };
