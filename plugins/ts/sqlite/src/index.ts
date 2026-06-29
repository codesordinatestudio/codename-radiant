import { SQLiteAdapter } from "./adapter";

export interface SQLiteConfig {
  url: string;
}

export function sqlite(config: SQLiteConfig) {
  return new SQLiteAdapter(config.url);
}

export { SQLiteAdapter };
