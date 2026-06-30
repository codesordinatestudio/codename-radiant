import { RedisAdapter } from "./adapter";

export type RedisOptions = {
  url: string;
  prefix?: string;
}

export function redis(options: RedisOptions): RedisAdapter {
  return new RedisAdapter(options.url, options.prefix);
}

export { RedisAdapter };
