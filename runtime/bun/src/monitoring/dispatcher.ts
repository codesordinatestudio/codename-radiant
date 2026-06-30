import type {
  RadiantMonitoringEvent,
  RadiantMonitoringExportBatch,
  RadiantMonitoringExporter,
  RadiantMonitoringExporterDispatcherOptions,
} from "./types";
import { matchesMonitoringQuery } from "./types";

export function shouldExportMonitoringEvent(exporter: RadiantMonitoringExporter, event: RadiantMonitoringEvent): boolean {
  if (!exporter.filter) return true;
  if (typeof exporter.filter === "function") return exporter.filter(event);
  return matchesMonitoringQuery(event, exporter.filter);
}

export class RadiantMonitoringExporterDispatcher {
  private readonly pending = new Map<string, RadiantMonitoringEvent[]>();
  private readonly attempts = new Map<string, number>();
  private readonly timers: Array<ReturnType<typeof setInterval>> = [];
  private started = false;
  public readonly exporters: RadiantMonitoringExporter[] = [];

  constructor(
    private readonly options: RadiantMonitoringExporterDispatcherOptions = {},
  ) {}

  addExporter(exporter: RadiantMonitoringExporter): void {
    this.exporters.push(exporter);
    this.pending.set(exporter.name, []);
    
    // If we've already started, start the flush interval for this exporter
    if (this.started) {
      const interval = exporter.flushIntervalMs ?? this.options.flushIntervalMs;
      if (interval && interval > 0) {
        this.timers.push(setInterval(() => {
          this.flushExporter(exporter).catch(() => {});
        }, interval));
      }
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    for (const exporter of this.exporters) {
      const interval = exporter.flushIntervalMs ?? this.options.flushIntervalMs;
      if (!interval || interval <= 0) continue;
      this.timers.push(setInterval(() => {
        this.flushExporter(exporter).catch(() => {});
      }, interval));
    }
  }

  async stop(): Promise<void> {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
    this.started = false;
    await this.flushAll();
  }

  async enqueue(event: RadiantMonitoringEvent): Promise<void> {
    for (const exporter of this.exporters) {
      if (!shouldExportMonitoringEvent(exporter, event)) continue;
      const events = this.pending.get(exporter.name) ?? [];
      events.push(event);
      this.pending.set(exporter.name, events);

      const batchSize = Math.max(1, exporter.batchSize ?? this.options.batchSize ?? 25);
      if (events.length >= batchSize) await this.flushExporter(exporter);
    }
  }

  async flushAll(): Promise<void> {
    for (const exporter of this.exporters) {
      await this.flushExporter(exporter);
    }
  }

  async flushExporter(exporter: RadiantMonitoringExporter | string): Promise<void> {
    const resolved = typeof exporter === "string"
      ? this.exporters.find((candidate) => candidate.name === exporter)
      : exporter;
    if (!resolved) return;

    const events = this.pending.get(resolved.name) ?? [];
    if (!events.length) return;
    this.pending.set(resolved.name, []);

    const attempt = (this.attempts.get(resolved.name) ?? 0) + 1;
    this.attempts.set(resolved.name, attempt);
    const batch: RadiantMonitoringExportBatch = {
      id: crypto.randomUUID(),
      exporterName: resolved.name,
      events,
      createdAt: new Date().toISOString(),
      attempt,
    };

    try {
      await resolved.export(batch);
    } catch (error) {
      this.pending.set(resolved.name, [...events, ...(this.pending.get(resolved.name) ?? [])]);
      await resolved.onError?.({ exporterName: resolved.name, batch, error });
      if (this.options.failOnExporterError) throw error;
    }
  }
}
