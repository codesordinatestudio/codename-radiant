import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  WebSocketManager,
  RadiantWebsocket,
  createWebSocketHandler,
  createBunWebSocketRoute,
} from "../../../../../runtime/bun/src/main/websocket";

describe("main/websocket", () => {
  let manager: WebSocketManager;

  beforeEach(() => {
    manager = new WebSocketManager();
  });

  afterEach(() => {
    manager.stopHeartbeat();
  });

  test("registers and removes connections", () => {
    const ws = { id: "client-1", data: {}, send: () => 0 };
    manager.register(ws);

    expect(manager.connectionCount).toBe(1);
    expect(manager.getStats().connections).toBe(1);

    manager.remove("client-1");
    expect(manager.connectionCount).toBe(0);
  });

  test("manages rooms correctly", () => {
    const ws1 = { id: "c1", data: {}, send: () => 0 };
    const ws2 = { id: "c2", data: {}, send: () => 0 };
    manager.register(ws1);
    manager.register(ws2);

    manager.joinRoom("c1", "lobby");
    manager.joinRoom("c2", "lobby");

    expect(manager.roomCount).toBe(1);
    expect(manager.getRoomMembers("lobby")).toEqual(["c1", "c2"]);
    expect(manager.getConnectionRooms("c1")).toEqual(["lobby"]);

    manager.leaveRoom("c1", "lobby");
    expect(manager.getRoomMembers("lobby")).toEqual(["c2"]);

    manager.leaveRoom("c2", "lobby");
    expect(manager.roomCount).toBe(0); // Empty rooms are deleted
  });

  test("broadcasts to room members except excluded", () => {
    let c1Received = false;
    let c2Received = false;

    const ws1 = {
      id: "c1",
      data: {},
      send: () => {
        c1Received = true;
        return 1;
      },
    };
    const ws2 = {
      id: "c2",
      data: {},
      send: () => {
        c2Received = true;
        return 1;
      },
    };

    manager.register(ws1);
    manager.register(ws2);
    manager.joinRoom("c1", "chat");
    manager.joinRoom("c2", "chat");

    const sent = manager.broadcastToRoom("chat", { msg: "hello" }, { exclude: ["c1"] });
    expect(sent).toBe(1);
    expect(c1Received).toBe(false);
    expect(c2Received).toBe(true);
  });

  test("creates bun route that handles upgrades", async () => {
    const route = createBunWebSocketRoute({ path: "/ws" });
    const req = new Request("http://localhost/ws");

    let upgraded = false;
    const mockServer = {
      upgrade(req: Request, options: any) {
        upgraded = true;
        return true;
      },
    };

    const result = await route(req, mockServer);
    expect(upgraded).toBe(true);
    expect(result).toBeUndefined(); // Returns undefined to let Bun take over
  });

  test("handles messages and internal routing", async () => {
    const handler = createWebSocketHandler();
    let sentMessage = "";

    const rawWs = {
      data: { id: "c1", handler },
      send: (msg: string) => {
        sentMessage = msg;
        return 1;
      },
    } as any;

    // Simulate open
    handler.open!(rawWs);
    expect(sentMessage).toContain("connected");

    // Simulate join
    await handler.message!(rawWs, JSON.stringify({ type: "join", room: "general" }));
    expect(sentMessage).toContain("joined");

    // Simulate ping
    await handler.message!(rawWs, JSON.stringify({ type: "ping" }));
    expect(sentMessage).toContain("pong");

    handler.close!(rawWs, 1000, "done");
  });
});
