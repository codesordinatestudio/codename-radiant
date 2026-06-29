import { PostgresAdapter } from "./adapter";

export type PostgresPluginOptions = {
  url: string;
  pgBouncer?: boolean;
  pool?: {
    max?: number;
  };
}

export function postgres(options: PostgresPluginOptions): PostgresAdapter {
  return new PostgresAdapter(options.url, options.pool?.max, options.pgBouncer);
}

export { PostgresAdapter };
