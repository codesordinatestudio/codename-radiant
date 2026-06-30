import { describe, test, expect, beforeEach } from "bun:test";
import { SSEManager, createBunSSERoute, RadiantSSE } from "../../../../../runtime/bun/src/main/sse";

describe("main/sse", () => {
  let manager: SSEManager;

  beforeEach(() => {
    manager = new SSEManager();
  });

  test("registers connections and manages channels", () => {
    let closed = false;
    const mockController = {
      enqueue: () => {},
      close: () => {
        closed = true;
      },
    } as any;

    const conn = {
      id: "client-1",
      controller: mockController,
      channels: new Set<string>(),
      request: new Request("http://localhost"),
      user: null,
      connectedAt: Date.now(),
    };

    manager.register(conn);
    expect(manager.connectionCount).toBe(1);

    manager.subscribe("client-1", "news");
    expect(manager.getChannelMembers("news")).toEqual(["client-1"]);
    expect(manager.getConnectionChannels("client-1")).toEqual(["news"]);

    manager.unsubscribe("client-1", "news");
    expect(manager.channelCount).toBe(0);

    manager.remove("client-1");
    expect(manager.connectionCount).toBe(0);
  });

  test("broadcasts correctly format SSE payloads", () => {
    let enqueued: Uint8Array | null = null;
    const mockController = {
      enqueue: (data: Uint8Array) => {
        enqueued = data;
      },
      close: () => {},
    } as any;

    const conn = {
      id: "c1",
      controller: mockController,
      channels: new Set<string>(),
      request: new Request("http://localhost"),
      user: null,
      connectedAt: Date.now(),
    };

    manager.register(conn);
    manager.subscribe("c1", "alerts");

    // Send string
    manager.broadcastToChannel("alerts", "Warning!");
    const strPayload = new TextDecoder().decode(enqueued!);
    expect(strPayload).toBe("data: Warning!\n\n");

    // Send object with event and data
    manager.broadcastToChannel("alerts", { event: "update", data: { temp: 42 } });
    const objPayload = new TextDecoder().decode(enqueued!);
    expect(objPayload).toContain("event: update\n");
    expect(objPayload).toContain('data: {"temp":42}\n\n');
  });

  test("creates an SSE route that handles requests and aborts", async () => {
    const route = createBunSSERoute({
      path: "/sse",
      heartbeat: false,
    });

    // Request with channels
    const req = new Request("http://localhost/sse?channel=news");
    const res = await route(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.body).toBeInstanceOf(ReadableStream);

    // We would need to read the stream to verify connection, but Bun's ReadableStream works.
    // Ensure the stream is abortable
    const reader = res.body!.getReader();
    const chunk = await reader.read();
    expect(chunk.value).toBeDefined(); // The initial "connected" event

    await reader.cancel();
  });
});
