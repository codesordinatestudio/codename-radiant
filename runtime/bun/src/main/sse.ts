import type { AuthUser } from "./access";
type MaybePromise<T> = T | Promise<T>;

type BroadcastOptions = {
  exclude?: string[];
};

type SSEPayload =
  | string
  | {
      id?: string | number;
      event?: string;
      retry?: number;
      data?: unknown;
      toSSE?: () => string;
    };

type SSEConnection = {
  id: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  channels: Set<string>;
  request: Request;
  user: AuthUser | null;
  connectedAt: number;
};

type ConnectionInfo = {
  id: string;
  request: Request;
  user: AuthUser | null;
};

type SubscribeInfo = ConnectionInfo & {
  channel: string;
};

const encoder = new TextEncoder();

function toSSE(payload: unknown): Uint8Array {
  if (typeof payload === "string") return encoder.encode(`data: ${payload}\n\n`);
  if (payload && typeof payload === "object" && "toSSE" in payload && typeof payload.toSSE === "function") {
    return encoder.encode(payload.toSSE());
  }
  const item = payload as SSEPayload;
  if (item && typeof item === "object" && ("data" in item || "event" in item || "id" in item || "retry" in item)) {
    const lines: string[] = [];
    if (item.id !== undefined) lines.push(`id: ${item.id}`);
    if (item.event) lines.push(`event: ${item.event}`);
    if (item.retry !== undefined) lines.push(`retry: ${item.retry}`);
    const data = item.data === undefined ? "" : typeof item.data === "string" ? item.data : JSON.stringify(item.data);
    for (const line of data.split("\n")) lines.push(`data: ${line}`);
    return encoder.encode(`${lines.join("\n")}\n\n`);
  }
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function parseChannels(request: Request): string[] {
  const url = new URL(request.url);
  const channels = new Set<string>();
  for (const channel of url.searchParams.getAll("channel")) {
    const trimmed = channel.trim();
    if (trimmed) channels.add(trimmed);
  }
  const rawChannels = url.searchParams.get("channels");
  if (rawChannels) {
    for (const channel of rawChannels.split(",")) {
      const trimmed = channel.trim();
      if (trimmed) channels.add(trimmed);
    }
  }
  return [...channels];
}

export class SSEManager {
  private connections = new Map<string, SSEConnection>();
  private channels = new Map<string, Set<string>>();
  private metadata = new Map<string, Record<string, unknown>>();

  register(connection: SSEConnection): void {
    this.connections.set(connection.id, connection);
    this.metadata.set(connection.id, {});
  }

  remove(id: string): void {
    const connection = this.connections.get(id);
    if (!connection) return;
    for (const channel of connection.channels) this.unsubscribe(id, channel);
    this.connections.delete(id);
    this.metadata.delete(id);
  }

  subscribe(id: string, channel: string): void {
    const connection = this.connections.get(id);
    if (!connection) return;
    if (!this.channels.has(channel)) this.channels.set(channel, new Set());
    this.channels.get(channel)!.add(id);
    connection.channels.add(channel);
  }

  unsubscribe(id: string, channel: string): void {
    this.channels.get(channel)?.delete(id);
    if (this.channels.get(channel)?.size === 0) this.channels.delete(channel);
    this.connections.get(id)?.channels.delete(channel);
  }

  sendTo(id: string, payload: unknown): boolean {
    const connection = this.connections.get(id);
    if (!connection) return false;
    try {
      connection.controller.enqueue(toSSE(payload));
      return true;
    } catch {
      this.remove(id);
      return false;
    }
  }

  broadcastToChannel(channel: string, payload: unknown, { exclude = [] }: BroadcastOptions = {}): number {
    const members = this.channels.get(channel);
    if (!members) return 0;
    let sent = 0;
    for (const id of members) {
      if (exclude.includes(id)) continue;
      if (this.sendTo(id, payload)) sent++;
    }
    return sent;
  }

  broadcastAll(payload: unknown, { exclude = [] }: BroadcastOptions = {}): number {
    let sent = 0;
    for (const id of this.connections.keys()) {
      if (exclude.includes(id)) continue;
      if (this.sendTo(id, payload)) sent++;
    }
    return sent;
  }

  setMeta(id: string, key: string, value: unknown): void {
    const meta = this.metadata.get(id);
    if (meta) meta[key] = value;
  }

  getMeta(id: string, key: string): unknown {
    return this.metadata.get(id)?.[key];
  }

  getChannelMembers(channel: string): string[] {
    return [...(this.channels.get(channel) ?? [])];
  }

  getConnectionChannels(id: string): string[] {
    return [...(this.connections.get(id)?.channels ?? [])];
  }

  listChannels(): string[] {
    return [...this.channels.keys()];
  }

  get connectionCount() {
    return this.connections.size;
  }

  get channelCount() {
    return this.channels.size;
  }

  getStats() {
    return {
      connections: this.connectionCount,
      channels: Object.fromEntries([...this.channels.entries()].map(([channel, ids]) => [channel, ids.size])),
    };
  }
}

export const sseManager = new SSEManager();

export function createBunSSERoute({
  path = "/sse",
  heartbeat,
  resolveUser,
  onConnect,
  onSubscribe,
}: {
  path?: string;
  heartbeat?: { interval?: number; event?: string; data?: unknown } | false;
  resolveUser?: (request: Request) => MaybePromise<AuthUser | null>;
  onConnect?: (info: ConnectionInfo) => MaybePromise<boolean | string>;
  onSubscribe?: (info: SubscribeInfo) => MaybePromise<boolean | string>;
} = {}) {
  return async (request: Request): Promise<Response> => {
    const user = resolveUser ? await resolveUser(request) : null;
    const channels = parseChannels(request);
    const id = crypto.randomUUID();
    const info: ConnectionInfo = { id, request, user };

    if (onConnect) {
      const allowed = await onConnect(info);
      if (allowed !== true) {
        const message = typeof allowed === "string" ? allowed : user ? "Forbidden" : "Unauthorized";
        return new Response(JSON.stringify({ message }), {
          status: user ? 403 : 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const allowedChannels: string[] = [];
    for (const channel of channels) {
      if (!onSubscribe || (await onSubscribe({ ...info, channel })) === true) {
        allowedChannels.push(channel);
      }
    }

    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const connection: SSEConnection = {
          id,
          controller,
          channels: new Set(),
          request,
          user,
          connectedAt: Date.now(),
        };
        sseManager.register(connection);
        for (const channel of allowedChannels) sseManager.subscribe(id, channel);
        controller.enqueue(toSSE({ event: "connected", data: { id, channels: allowedChannels, authenticated: !!user } }));

        if (heartbeat !== false) {
          heartbeatTimer = setInterval(() => {
            sseManager.sendTo(id, {
              event: heartbeat?.event ?? "ping",
              data: heartbeat?.data ?? { ts: new Date().toISOString() },
            });
          }, heartbeat?.interval ?? 30_000);
          if (heartbeatTimer.unref) heartbeatTimer.unref();
        }

        request.signal.addEventListener(
          "abort",
          () => {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            sseManager.remove(id);
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          },
          { once: true },
        );
      },
      cancel() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        sseManager.remove(id);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  };
}

export class RadiantSSE {
  static get manager() {
    return sseManager;
  }

  static route(options: Parameters<typeof createBunSSERoute>[0] = {}) {
    return createBunSSERoute(options);
  }

  static register(connection: SSEConnection) {
    return sseManager.register(connection);
  }
  static remove(id: string) {
    return sseManager.remove(id);
  }
  static subscribe(id: string, channel: string) {
    return sseManager.subscribe(id, channel);
  }
  static unsubscribe(id: string, channel: string) {
    return sseManager.unsubscribe(id, channel);
  }
  static sendTo(id: string, payload: unknown) {
    return sseManager.sendTo(id, payload);
  }
  static broadcastToChannel(channel: string, payload: unknown, opts?: { exclude?: string[] }) {
    return sseManager.broadcastToChannel(channel, payload, opts);
  }
  static broadcastAll(payload: unknown, opts?: { exclude?: string[] }) {
    return sseManager.broadcastAll(payload, opts);
  }
  static setMeta(id: string, key: string, value: unknown) {
    return sseManager.setMeta(id, key, value);
  }
  static getMeta(id: string, key: string) {
    return sseManager.getMeta(id, key);
  }
  static getChannelMembers(channel: string) {
    return sseManager.getChannelMembers(channel);
  }
  static getConnectionChannels(id: string) {
    return sseManager.getConnectionChannels(id);
  }
  static listChannels() {
    return sseManager.listChannels();
  }
  static get connectionCount() {
    return sseManager.connectionCount;
  }
  static get channelCount() {
    return sseManager.channelCount;
  }
  static getStats() {
    return sseManager.getStats();
  }
}
