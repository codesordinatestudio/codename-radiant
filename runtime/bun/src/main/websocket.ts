export interface RadiantServerWebSocket {
  id: string;
  data: Record<string, unknown>;
  send(message: string | ArrayBuffer | Uint8Array, compress?: boolean): number;
}


export interface RadiantWebSocketData {
  id: string;
  path: string;
  handler: RadiantWebSocketHandler;
}

type BroadcastOptions = {
  exclude?: string[];
};

type MaybePromise<T> = T | Promise<T>;

type BunUpgradeServer = {
  upgrade(request: Request, options: { data: RadiantWebSocketData }): boolean;
};

export interface RadiantWebSocketHandler {
  open?(ws: Bun.ServerWebSocket<RadiantWebSocketData>): void | Promise<void>;
  message?(
    ws: Bun.ServerWebSocket<RadiantWebSocketData>,
    message: string | Buffer,
  ): void | Promise<void>;
  close?(
    ws: Bun.ServerWebSocket<RadiantWebSocketData>,
    code: number,
    reason: string,
  ): void | Promise<void>;
  drain?(ws: Bun.ServerWebSocket<RadiantWebSocketData>): void | Promise<void>;
}

export class WebSocketManager {
  private connections = new Map<string, RadiantServerWebSocket>();
  private rooms = new Map<string, Set<string>>();
  private connectionRooms = new Map<string, Set<string>>();
  private metadata = new Map<string, Record<string, unknown>>();
  private lastPong = new Map<string, number>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  register(ws: RadiantServerWebSocket): void {
    this.connections.set(ws.id, ws);
    this.connectionRooms.set(ws.id, new Set());
    this.metadata.set(ws.id, {});
    this.lastPong.set(ws.id, Date.now());
  }

  remove(wsOrId: RadiantServerWebSocket | string): void {
    const id = typeof wsOrId === "string" ? wsOrId : wsOrId.id;
    for (const room of this.connectionRooms.get(id) ?? []) {
      this.leaveRoom(id, room);
    }
    this.connections.delete(id);
    this.connectionRooms.delete(id);
    this.metadata.delete(id);
    this.lastPong.delete(id);
  }

  pong(id: string): void {
    if (this.lastPong.has(id)) this.lastPong.set(id, Date.now());
  }

  startHeartbeat(intervalMs = 30_000, timeoutMs = 10_000): void {
    if (this.heartbeatTimer !== null) return;
    const deadline = intervalMs + timeoutMs;
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, lastSeen] of this.lastPong) {
        if (now - lastSeen > deadline) this.remove(id);
      }
      for (const ws of this.connections.values()) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, intervalMs);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  joinRoom(id: string, room: string): void {
    if (!this.rooms.has(room)) this.rooms.set(room, new Set());
    this.rooms.get(room)!.add(id);
    this.connectionRooms.get(id)?.add(room);
  }

  leaveRoom(id: string, room: string): void {
    this.rooms.get(room)?.delete(id);
    if (this.rooms.get(room)?.size === 0) this.rooms.delete(room);
    this.connectionRooms.get(id)?.delete(room);
  }

  getRoomMembers(room: string): string[] {
    return [...(this.rooms.get(room) ?? [])];
  }

  getConnectionRooms(id: string): string[] {
    return [...(this.connectionRooms.get(id) ?? [])];
  }

  listRooms(): string[] {
    return [...this.rooms.keys()];
  }

  sendTo(id: string, payload: unknown): boolean {
    const ws = this.connections.get(id);
    if (!ws) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  broadcastToRoom(room: string, payload: unknown, { exclude = [] }: BroadcastOptions = {}): number {
    const ids = this.rooms.get(room);
    if (!ids) return 0;
    let sent = 0;
    for (const id of ids) {
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

  get connectionCount() {
    return this.connections.size;
  }

  get roomCount() {
    return this.rooms.size;
  }

  getStats() {
    return {
      connections: this.connectionCount,
      rooms: Object.fromEntries([...this.rooms.entries()].map(([room, ids]) => [room, ids.size])),
      heartbeatActive: this.heartbeatTimer !== null,
    };
  }
}

export const wsManager = new WebSocketManager();

function toServerWebSocket(ws: Bun.ServerWebSocket<RadiantWebSocketData>): RadiantServerWebSocket {
  return {
    id: ws.data.id,
    data: ws.data as unknown as Record<string, unknown>,
    send: (message, compress) => ws.send(message, compress),
  };
}

function parseMessage(message: string | Buffer): { type: string; room?: string; payload?: unknown } {
  if (typeof message !== "string") {
    return { type: "binary", payload: message };
  }
  try {
    const parsed = JSON.parse(message);
    return parsed && typeof parsed === "object" ? parsed : { type: "message", payload: parsed };
  } catch {
    return { type: "message", payload: message };
  }
}

export function createWebSocketHandler({
  heartbeat,
  onJoinRoom,
}: {
  heartbeat?: { interval?: number; timeout?: number } | false;
  onJoinRoom?: (room: string, ws: RadiantServerWebSocket) => MaybePromise<boolean>;
} = {}): RadiantWebSocketHandler {
  const startHeartbeat = () => {
    if (heartbeat === false) return;
    wsManager.startHeartbeat(heartbeat?.interval, heartbeat?.timeout);
  };

  return {
    open(ws) {
      const wrapped = toServerWebSocket(ws);
      wsManager.register(wrapped);
      startHeartbeat();
      ws.send(JSON.stringify({ type: "connected", id: wrapped.id }));
    },

    async message(ws, rawMessage) {
      const message = parseMessage(rawMessage);
      const wrapped = toServerWebSocket(ws);
      const { id } = wrapped;

      switch (message.type) {
        case "join":
          if (!message.room) return;
          if (onJoinRoom && !(await onJoinRoom(message.room, wrapped))) {
            ws.send(JSON.stringify({ type: "error", message: `Access denied to room '${message.room}'` }));
            return;
          }
          wsManager.joinRoom(id, message.room);
          ws.send(JSON.stringify({ type: "joined", room: message.room }));
          return;

        case "leave":
          if (!message.room) return;
          wsManager.leaveRoom(id, message.room);
          ws.send(JSON.stringify({ type: "left", room: message.room }));
          return;

        case "broadcast":
          if (message.room) {
            wsManager.broadcastToRoom(message.room, { type: "message", from: id, payload: message.payload }, { exclude: [id] });
          }
          return;

        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          return;

        case "pong":
          wsManager.pong(id);
          return;

        default:
          ws.send(JSON.stringify({ type: "error", message: `Unknown type: ${message.type}` }));
      }
    },

    close(ws) {
      wsManager.remove(ws.data.id);
    },
  };
}

export function createBunWebSocketRoute({
  path = "/ws",
  heartbeat,
  onJoinRoom,
}: {
  path?: string;
  heartbeat?: { interval?: number; timeout?: number } | false;
  onJoinRoom?: (room: string, ws: RadiantServerWebSocket) => MaybePromise<boolean>;
} = {}) {
  const handler = createWebSocketHandler({ heartbeat, onJoinRoom });
  return async (request: Request, server: any): Promise<Response> => {
    if (!server) return new Response(JSON.stringify({ message: "WebSocket upgrade requires Bun.serve to pass the server into fetch" }), { status: 500 });
    const didUpgrade = server.upgrade(request, {
      data: {
        id: crypto.randomUUID(),
        path,
        handler,
      },
    });
    if (didUpgrade) {
      // Return undefined or an empty response to signal Bun has taken over
      return undefined as any; 
    }
    return new Response(JSON.stringify({ message: "WebSocket upgrade failed" }), { status: 400 });
  };
}

export function createBunWebSocketHandlers(): Bun.WebSocketHandler<RadiantWebSocketData> {
  return {
    open(ws) {
      return ws.data.handler.open?.(ws);
    },
    message(ws, message) {
      return ws.data.handler.message?.(ws, message);
    },
    close(ws, code, reason) {
      return ws.data.handler.close?.(ws, code, reason);
    },
    drain(ws) {
      return ws.data.handler.drain?.(ws);
    },
  };
}

export class RadiantWebsocket {
  static get manager() {
    return wsManager;
  }

  static route(options: Parameters<typeof createBunWebSocketRoute>[0] = {}) {
    return createBunWebSocketRoute(options);
  }

  static handler(options: Parameters<typeof createWebSocketHandler>[0] = {}) {
    return createWebSocketHandler(options);
  }

  static handlers() {
    return createBunWebSocketHandlers();
  }

  static register(ws: RadiantServerWebSocket) {
    return wsManager.register(ws);
  }
  static remove(wsOrId: RadiantServerWebSocket | string) {
    return wsManager.remove(wsOrId);
  }
  static pong(id: string) {
    return wsManager.pong(id);
  }
  static startHeartbeat(intervalMs?: number, timeoutMs?: number) {
    return wsManager.startHeartbeat(intervalMs, timeoutMs);
  }
  static stopHeartbeat() {
    return wsManager.stopHeartbeat();
  }
  static joinRoom(id: string, room: string) {
    return wsManager.joinRoom(id, room);
  }
  static leaveRoom(id: string, room: string) {
    return wsManager.leaveRoom(id, room);
  }
  static getRoomMembers(room: string) {
    return wsManager.getRoomMembers(room);
  }
  static getConnectionRooms(id: string) {
    return wsManager.getConnectionRooms(id);
  }
  static listRooms() {
    return wsManager.listRooms();
  }
  static sendTo(id: string, payload: unknown) {
    return wsManager.sendTo(id, payload);
  }
  static broadcastToRoom(room: string, payload: unknown, opts?: { exclude?: string[] }) {
    return wsManager.broadcastToRoom(room, payload, opts);
  }
  static broadcastAll(payload: unknown, opts?: { exclude?: string[] }) {
    return wsManager.broadcastAll(payload, opts);
  }
  static setMeta(id: string, key: string, value: unknown) {
    return wsManager.setMeta(id, key, value);
  }
  static getMeta(id: string, key: string) {
    return wsManager.getMeta(id, key);
  }
  static get connectionCount() {
    return wsManager.connectionCount;
  }
  static get roomCount() {
    return wsManager.roomCount;
  }
  static getStats() {
    return wsManager.getStats();
  }
}
