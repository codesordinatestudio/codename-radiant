import { MongoDBAdapter, type MongoDBOptions } from "./adapter";

export function defineDatabasePlugin(options: MongoDBOptions) {
  return {
    name: "mongodb",
    type: "database",
    createAdapter: () => new MongoDBAdapter(options),
  };
}

export * from "./adapter";
