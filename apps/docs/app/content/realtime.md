# Realtime: SSE, WebSocket & Durable Streams

Radiant provides three realtime mechanisms for pushing data changes to connected clients. All are declared in the DSL per-collection and auto-configured by the runtime.

## Enabling Realtime

In your `.radiant` file:

```radiant
collection todos {
  realtime: {
    ws: ["create", "update", "delete"]
    sse: ["create", "update", "delete"]
    durableStream: true
  }
  fields: {
    title: text
    completed: boolean @default(false)
  }
}
```

| Option | Type | Description |
|---|---|---|
| `ws` | `Boolean` or `String[]` | WebSocket push. `true` = all events, or specify events: `["create", "update", "delete"]` |
| `sse` | `Boolean` or `String[]` | Server-Sent Events push. Same semantics as `ws`. |
| `durableStream` | `Boolean` or `String[]` | Persisted event log for replay. Same semantics. |

When any collection has realtime enabled, the runtime mounts:
- `GET /api/ws` — WebSocket upgrade endpoint
- `GET /api/sse` — Server-Sent Events endpoint
- `GET /api/<slug>/stream` — Durable stream read endpoint (per collection)

## WebSocket

WebSocket provides bidirectional, persistent connections with room-based pub/sub.

### Connecting

```javascript
const ws = new WebSocket("ws://localhost:3000/api/ws");

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg);
};
```

On connect, the server sends:

```json
{ "type": "connected", "id": "conn-uuid" }
```

### Joining a Room

Join a collection's room to receive change events:

```javascript
ws.send(JSON.stringify({ type: "join", room: "todos" }));
```

Response:

```json
{ "type": "joined", "room": "todos" }
```

### Receiving Change Events

When a CRUD operation occurs on a collection you've joined, you receive:

```json
{
  "event": "todos:created",
  "data": { "id": "abc-123", "title": "Buy groceries", "completed": false }
}
```

The event name follows the pattern `<collection>:<action>`:
- `todos:created`
- `todos:updated`
- `todos:deleted`

### Leaving a Room

```javascript
ws.send(JSON.stringify({ type: "leave", room: "todos" }));
```

### Broadcasting to a Room

From your TypeScript code, broadcast a custom message to all connections in a room:

```typescript
import { RadiantWebsocket } from "@codesordinatestudio/radiant-bun";

RadiantWebsocket.broadcastToRoom("todos", {
  type: "notification",
  message: "System maintenance in 10 minutes",
});
```

### WebSocket Manager API

```typescript
// Send to a specific connection
RadiantWebsocket.sendTo(connectionId, { type: "ping" });

// Broadcast to all connections
RadiantWebsocket.broadcastAll({ type: "announcement" });

// Broadcast with exclusions
RadiantWebsocket.broadcastToRoom("todos", payload, { exclude: [senderId] });

// Get room members
const members = RadiantWebsocket.getRoomMembers("todos");

// Stats
const stats = RadiantWebsocket.getStats();
// { connections: 15, rooms: { todos: 12, posts: 3 }, heartbeatActive: true }
```

### Ping/Pong Heartbeat

The WebSocket manager has a built-in heartbeat to detect dead connections:

```javascript
// Client responds to server pings
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "ping") {
    ws.send(JSON.stringify({ type: "pong" }));
  }
};
```

## Server-Sent Events (SSE)

SSE provides unidirectional server-to-client push over HTTP. Simpler than WebSocket — no custom protocol, works through proxies.

### Connecting

```javascript
const es = new EventSource("http://localhost:3000/api/sse?channel=todos");

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

On connect, the server sends:

```
event: connected
data: {"id":"conn-uuid","channels":["todos"],"authenticated":false}
```

### Subscribing to Channels

Pass channel names via query parameters:

```bash
# Single channel
GET /api/sse?channel=todos

# Multiple channels
GET /api/sse?channel=todos&channel=posts

# Or comma-separated
GET /api/sse?channels=todos,posts
```

### Receiving Change Events

```
data: {"event":"todos:created","data":{"id":"abc-123","title":"Buy groceries"}}
```

### SSE Manager API

```typescript
import { RadiantSSE } from "@codesordinatestudio/radiant-bun";

// Broadcast to a channel
RadiantSSE.broadcastToChannel("todos", {
  event: "todos:created",
  data: { id: "abc-123", title: "New todo" }
});

// Broadcast to all connections
RadiantSSE.broadcastAll({ type: "announcement", data: "Hello everyone" });

// Send to a specific connection
RadiantSSE.sendTo(connectionId, { event: "custom", data: "private message" });

// Stats
const stats = RadiantSSE.getStats();
// { connections: 8, channels: { todos: 5, posts: 3 } }
```

## Durable Streams

Durable streams persist change events so clients can replay them after a disconnection. Unlike WS and SSE which are ephemeral, durable streams store events in a log (in-memory for development, Redis/ElectricSQL for production).

### Reading Events

```bash
# Get all events for a collection
GET /api/todos/stream

# Get events after a specific event ID (for replay after reconnect)
GET /api/todos/stream?lastEventId=1234567890-abcde
```

Response:

```json
[
  {
    "id": "1234567890-abcde",
    "collection": "todos",
    "action": "created",
    "data": { "id": "abc-123", "title": "Buy groceries" },
    "timestamp": 1234567890000
  }
]
```

### Default: In-Memory Store

By default, Radiant uses `MemoryStreamStore` — a ring buffer (max 1000 events per collection) that lives in the process memory. **This is development-only**: events are lost on restart and don't work across multiple servers.

### Production: Durable Streams Plugin

For production, use the durable streams plugin which persists events to an external store:

```bash
bun add @codesordinatestudio/radiant-plugin-durable-streams
```

```typescript
import { createRadiant } from "../radiant/runtime";
import { sqlite } from "@codesordinatestudio/radiant-plugin-sqlite";
import { durableStreams } from "@codesordinatestudio/radiant-plugin-durable-streams";

export const app = createRadiant({
  adapter: sqlite({ url: process.env.DATABASE_URL! }),
  streamStore: durableStreams({
    url: process.env.DURABLE_STREAMS_URL!,
  }),
});
```

### Reading Events Programmatically

```typescript
// Read all events
const events = await app.streamStore.read("todos");

// Read events after a cursor
const newEvents = await app.streamStore.read("todos", "last-event-id");
```

## Event Flow

When a CRUD operation occurs on a collection with realtime enabled:

1. The database operation completes
2. `broadcastChange(action, data)` is called
3. For each enabled realtime channel:
   - **WS**: `RadiantWebsocket.broadcastToRoom(collectionSlug, payload)`
   - **SSE**: `RadiantSSE.broadcastToChannel(collectionSlug, payload)`
   - **Durable**: `streamStore.publish(collectionSlug, action, data)`

The payload format is:

```json
{
  "event": "<collection>:<action>",
  "data": { ...record }
}
```

## Related

- [Collections](./collections) — Enabling realtime in the DSL
- [Queue Manager](./queue-manager) — Background job processing