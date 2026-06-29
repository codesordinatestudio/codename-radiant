import { defineDatabasePlugin, type LucentDatabasePluginConfig } from "@codesordinatestudio/lucent-core";
import { MongoDBAdapter } from "./adapter";

export type MongoDBPluginOptions = {
  url: string;
  database?: string;
}

export type MongoDBPluginConfig = LucentDatabasePluginConfig<MongoDBPluginOptions>;

export function mongodb(options: MongoDBPluginOptions): MongoDBPluginConfig {
  return defineDatabasePlugin({
    type: "mongodb",
    options,
    createAdapter() {
      return new MongoDBAdapter(options);
    },
  });
}

export { MongoDBAdapter };
