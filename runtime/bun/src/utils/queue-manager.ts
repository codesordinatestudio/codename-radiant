import type { ConnectionOptions, JobsOptions, QueueOptions, WorkerOptions } from "bullmq";
import { Queue as BullQueue, Worker as BullWorker, QueueEvents as BullQueueEvents } from "bullmq";
import { logger } from "./logger";

export interface BullMQConfig {
  connection: ConnectionOptions;
  prefix?: string;
}

export interface QueueSystemConfig {
  bullmq: BullMQConfig;
  defaultQueueOptions?: Omit<QueueOptions, "connection" | "prefix">;
  defaultWorkerOptions?: Omit<WorkerOptions, "connection" | "prefix">;
}

export interface QueueJob<T = unknown> {
  id?: string;
  name: string;
  data: T;
  getState?: () => Promise<string>;
}

export interface QueueEventsLike {
  disconnect(): Promise<void>;
}

export interface WorkerLike {
  close(): Promise<void>;
  waitUntilReady?: () => Promise<void>;
}

export interface QueueLike<T = unknown> {
  add(name: string, data: T, opts?: JobOptions): Promise<QueueJob<T>>;
  addBulk(jobs: BulkJobDefinition<T>[]): Promise<QueueJob<T>[]>;
  getRepeatableJobs(): Promise<{ name: string; key: string }[]>;
  removeRepeatableByKey(key: string): Promise<boolean>;
  disconnect(): Promise<void>;
}

export type JobOptions = JobsOptions;
export type JobHandler<T = unknown, R = unknown> = (job: QueueJob<T>) => Promise<R>;

export interface QueueDefinition {
  name: string;
  options?: Omit<QueueOptions, "connection" | "prefix">;
}

export interface BulkJobDefinition<T = unknown> {
  name: string;
  data: T;
  opts?: JobOptions;
}

type TypedBullQueue<T> = BullQueue<T, unknown, string, T, unknown, string>;

class BullMQQueueAdapter<T = unknown> implements QueueLike<T> {
  constructor(private readonly queue: TypedBullQueue<T>) {}

  public async add(name: string, data: T, opts?: JobOptions): Promise<QueueJob<T>> {
    return (await this.queue.add(name, data, opts)) as QueueJob<T>;
  }

  public async addBulk(jobs: BulkJobDefinition<T>[]): Promise<QueueJob<T>[]> {
    const bulkJobs = jobs.map((job) => ({
      name: job.name,
      data: job.data,
      opts: job.opts,
    })) as Parameters<TypedBullQueue<T>["addBulk"]>[0];
    return (await this.queue.addBulk(bulkJobs)) as QueueJob<T>[];
  }

  public async getRepeatableJobs(): Promise<{ name: string; key: string }[]> {
    return await this.queue.getRepeatableJobs();
  }

  public async removeRepeatableByKey(key: string): Promise<boolean> {
    return await this.queue.removeRepeatableByKey(key);
  }

  public async disconnect(): Promise<void> {
    await this.queue.close();
  }
}

export class RadiantQueueManager {
  private static instance: RadiantQueueManager | undefined;
  private readonly queues = new Map<string, QueueLike>();
  private readonly workers = new Map<string, WorkerLike>();
  private readonly queueEvents = new Map<string, QueueEventsLike>();
  private readonly config: QueueSystemConfig;
  private closing = false;

  private constructor(config: QueueSystemConfig) {
    this.config = config;

    if (!this.config.bullmq?.connection) {
      throw new Error('RadiantQueueManager: bullmq provider requires "bullmq.connection"');
    }
  }

  private getBullMQBaseOptions(): { connection: ConnectionOptions; prefix?: string } {
    return {
      ...(this.config.bullmq.prefix ? { prefix: this.config.bullmq.prefix } : {}),
      connection: this.config.bullmq.connection,
    };
  }

  public static initialize(config: QueueSystemConfig): RadiantQueueManager {
    if (!RadiantQueueManager.instance) {
      RadiantQueueManager.instance = new RadiantQueueManager(config);
    }
    return RadiantQueueManager.instance;
  }

  public static getInstance(): RadiantQueueManager {
    if (!RadiantQueueManager.instance) {
      throw new Error("RadiantQueueManager not initialized. Call initialize() first.");
    }
    return RadiantQueueManager.instance;
  }

  public getQueue<T = unknown>(name: string): QueueLike<T> {
    const existing = this.queues.get(name);
    if (existing) return existing as QueueLike<T>;

    const queue = new BullQueue<T, unknown, string, T, unknown, string>(name, {
      ...(this.config.defaultQueueOptions ?? {}),
      ...this.getBullMQBaseOptions(),
    });

    const wrapped = new BullMQQueueAdapter<T>(queue);
    this.queues.set(name, wrapped as QueueLike);
    return wrapped;
  }

  public async addJob<T = unknown>(queueName: string, jobName: string, data: T, opts?: JobOptions): Promise<QueueJob<T>> {
    const queue = this.getQueue<T>(queueName);
    return await queue.add(jobName, data, opts);
  }

  public async addBulk<T = unknown>(queueName: string, jobs: BulkJobDefinition<T>[]): Promise<QueueJob<T>[]> {
    const queue = this.getQueue<T>(queueName);
    return await queue.addBulk(jobs);
  }

  public registerWorker<T = unknown>(
    queueName: string,
    handler: JobHandler<T>,
    options?: Omit<WorkerOptions, "connection" | "prefix">,
  ): WorkerLike {
    const existing = this.workers.get(queueName);
    const queueNameForLogs = `[ ${queueName?.toUpperCase()} WORKER ]`;
    if (existing) {
      logger.warn(`${queueNameForLogs} Replacing existing worker for queue "${queueName}"`);
      existing
        .close()
        .catch((err) => logger.error(err, `${queueNameForLogs} Error closing old worker for "${queueName}"`));
      this.workers.delete(queueName);
    }

    const worker = new BullWorker(
      queueName,
      async (job: QueueJob<T>) => await handler(job),
      {
        ...(this.config.defaultWorkerOptions ?? {}),
        ...(options ?? {}),
        ...this.getBullMQBaseOptions(),
      },
    );

    worker.on("completed", (job: QueueJob<T>) => {
      logger.info(`${queueNameForLogs} Job ${job.id} completed`);
    });

    worker.on("failed", (job: QueueJob<T> | undefined, err: Error) => {
      logger.error(err, `${queueNameForLogs} Job ${job?.id ?? "unknown"} failed`);
    });

    worker.on("error", (err: Error) => {
      logger.error(err, `${queueNameForLogs} Worker error`);
    });

    worker
      .waitUntilReady()
      .then(() => logger.info(`${queueNameForLogs} Worker is ready and listening . . .`))
      .catch((err: Error) => logger.error(err, `${queueNameForLogs} Worker failed to become ready`));

    const wrapped: WorkerLike = {
      close: async () => {
        await worker.close();
      },
      waitUntilReady: async () => {
        await worker.waitUntilReady();
      },
    };

    this.workers.set(queueName, wrapped);
    return wrapped;
  }

  public getQueueEvents(name: string): QueueEventsLike {
    const existing = this.queueEvents.get(name);
    if (existing) return existing;

    const events = new BullQueueEvents(name, {
      ...this.getBullMQBaseOptions(),
    });

    const wrapped: QueueEventsLike = {
      disconnect: async () => {
        await events.close();
      },
    };

    this.queueEvents.set(name, wrapped);
    return wrapped;
  }

  public static _reset(): void {
    RadiantQueueManager.instance = undefined;
  }

  public async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;

    try {
      await Promise.allSettled(Array.from(this.workers.values()).map((w) => w.close()));
      await Promise.allSettled(Array.from(this.queueEvents.values()).map((e) => e.disconnect()));
      await Promise.allSettled(Array.from(this.queues.values()).map((q) => q.disconnect()));
    } finally {
      this.workers.clear();
      this.queueEvents.clear();
      this.queues.clear();
      this.closing = false;
    }
  }
}
