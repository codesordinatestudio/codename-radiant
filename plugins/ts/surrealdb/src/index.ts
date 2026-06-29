import { SurrealDBAdapter, type SurrealDBOptions } from "./adapter";

export function defineDatabasePlugin(options: SurrealDBOptions) {
  return {
    name: "surrealdb",
    type: "database",
    createAdapter: () => new SurrealDBAdapter(options),
  };
}

export * from "./adapter";
