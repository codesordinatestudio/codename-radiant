import { ElectricDurableStreamStore } from "./adapter";

export type DurableStreamsOptions = {
  url: string;
  token?: string;
}

export function durableStreams(options: DurableStreamsOptions): ElectricDurableStreamStore {
  return new ElectricDurableStreamStore(options.url, options.token);
}

export { ElectricDurableStreamStore };
