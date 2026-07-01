# Queue Manager

Radiant includes a `RadiantQueueManager` built on [BullMQ](https://docs.bullmq.io/) for background job processing. Use it for email sending, data processing, scheduled tasks, or any work that should run outside the request-response cycle.

## Setup

The queue manager requires a Redis connection. Initialise it once at startup:

```typescript
import { RadiantQueueManager } from "@codesordinatestudio/radiant-bun";

// Initialise once — creates the singleton
RadiantQueueManager.initialize({
  bullmq: {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
    },
  },
});
```

## Adding Jobs

Push jobs to a queue by name:

```typescript
const qm = RadiantQueueManager.getInstance();

// Add a single job
const job = await qm.addJob("emails", "send-welcome", {
  to: "user@example.com",
  name: "John",
});

// Add with options
const job = await qm.addJob("reports", "generate-monthly", {
  userId: "abc-123",
  month: "2026-06",
}, {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: true,
});

// Add bulk jobs
await qm.addBulk("notifications", [
  { name: "notify", data: { userId: "user-1", message: "Hello" } },
  { name: "notify", data: { userId: "user-2", message: "Hello" } },
  { name: "notify", data: { userId: "user-3", message: "Hello" } },
]);
```

## Registering Workers

Workers process jobs from a queue. Register a handler for each queue:

```typescript
qm.registerWorker("emails", async (job) => {
  console.log(`Processing ${job.name}:`, job.data);
  
  if (job.name === "send-welcome") {
    await sendWelcomeEmail(job.data.to, job.data.name);
  }
});

qm.registerWorker("reports", async (job) => {
  if (job.name === "generate-monthly") {
    const report = await generateReport(job.data.userId, job.data.month);
    await saveReport(report);
  }
});
```

## Integration with Cron

When the queue manager is initialised, cron jobs automatically use BullMQ's repeatable jobs instead of local `Bun.cron`:

```typescript
import { app } from "./app";

// If RadiantQueueManager is initialised, this creates a BullMQ repeatable job
// If not, it falls back to Bun.cron (local, single-process)
app.cron("daily-report", "0 9 * * *", async (app) => {
  const users = await app.find("users", { limit: 1000 });
  for (const user of users.docs) {
    await RadiantQueueManager.getInstance().addJob("reports", "daily-summary", {
      userId: user.id,
    });
  }
});
```

## Job Options

BullMQ job options supported via the `opts` parameter:

| Option | Type | Description |
|---|---|---|
| `attempts` | `number` | Number of retry attempts on failure |
| `backoff` | `{ type: "exponential" \| "fixed", delay: number }` | Retry backoff strategy |
| `delay` | `number` | Delay before processing (ms) |
| `removeOnComplete` | `boolean \| number` | Remove on completion |
| `removeOnFail` | `boolean \| number` | Remove on failure |
| `repeat` | `{ pattern: string }` | Cron pattern for repeatable jobs |
| `priority` | `number` | Higher priority = processed first |

## Managing Repeatable Jobs

```typescript
const qm = RadiantQueueManager.getInstance();
const queue = qm.getQueue("radiant_cron");

// List repeatable jobs
const repeatable = await queue.getRepeatableJobs();

// Remove a repeatable job by key
await queue.removeRepeatableByKey(repeatable[0].key);
```

## Graceful Shutdown

The queue manager cleans up workers, queues, and event listeners on shutdown:

```typescript
const qm = RadiantQueueManager.getInstance();
await qm.close();
// Closes all workers, queue event listeners, and queue connections
```

When you call `server.stop()`, Radiant automatically stops all cron jobs. For queue cleanup, call `qm.close()` before stopping the server.

## Full Example

```typescript
// src/queue.ts
import { RadiantQueueManager } from "@codesordinatestudio/radiant-bun";
import { app } from "./app";

// 1. Initialise with Redis
RadiantQueueManager.initialize({
  bullmq: {
    connection: {
      host: process.env.REDIS_HOST!,
      port: 6379,
    },
  },
});

const qm = RadiantQueueManager.getInstance();

// 2. Register workers
qm.registerWorker("emails", async (job) => {
  if (job.name === "send-welcome") {
    await app.mailer?.sendWelcome(job.data.to);
  }
});

qm.registerWorker("notifications", async (job) => {
  if (job.name === "notify") {
    await sendPushNotification(job.data.userId, job.data.message);
  }
});

// 3. Enqueue from hooks
app.hooks("users", {
  afterCreate: async (ctx) => {
    await qm.addJob("emails", "send-welcome", { to: ctx.data.email });
  },
});
```

## Related

- [Hooks](./hooks) — Enqueue jobs from lifecycle hooks
- [Realtime](./realtime) — Pushing changes to connected clients