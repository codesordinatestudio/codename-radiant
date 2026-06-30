import type { RadiantMonitoringEvent, RadiantMonitoringEventType, RadiantMonitoringHealthState, RadiantMonitoringQuery, RadiantMonitoringSubscriber, RadiantMonitoringSummary, RadiantMonitoringSeverity } from "./types";
import { matchesMonitoringQuery } from "./types";

export class RadiantMonitoringBuffer {
  private readonly events: RadiantMonitoringEvent[] = [];
  private readonly subscribers = new Set<RadiantMonitoringSubscriber>();

  constructor(private readonly maxEvents = 1000) {}

  push(event: RadiantMonitoringEvent): void {
    this.write(event);
  }

  write(event: RadiantMonitoringEvent): void {
    this.events.push(event);
    while (this.events.length > this.maxEvents) this.events.shift();

    for (const subscriber of this.subscribers) {
      Promise.resolve(subscriber(event)).catch(() => {});
    }
  }

  query(options: RadiantMonitoringQuery = {}): RadiantMonitoringEvent[] {
    const limit = Math.max(1, Math.min(options.limit ?? 100, this.maxEvents));
    const filtered = this.events.filter((event) => matchesMonitoringQuery(event, options));
    return filtered.slice(-limit);
  }

  summary(options: RadiantMonitoringQuery = {}): RadiantMonitoringSummary {
    const events = this.events.filter((event) => matchesMonitoringQuery(event, { ...options, limit: undefined }));
    const byType: Partial<Record<RadiantMonitoringEventType, number>> = {};
    const bySeverity: Partial<Record<RadiantMonitoringSeverity, number>> = {};
    const completedRequests = events.filter((event) => event.type === "request.completed");
    const requestDurations = completedRequests
      .map((event) => event.durationMs)
      .filter((duration): duration is number => typeof duration === "number");
    const averageDurationMs = requestDurations.length
      ? requestDurations.reduce((total, duration) => total + duration, 0) / requestDurations.length
      : undefined;

    for (const event of events) {
      byType[event.type] = (byType[event.type] ?? 0) + 1;
      if (event.severity) bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
    }

    return {
      total: events.length,
      byType,
      bySeverity,
      requests: {
        total: completedRequests.length,
        errors: events.filter((event) => event.type === "request.error").length,
        averageDurationMs,
      },
      lastEvent: events.at(-1),
    };
  }

  health(): RadiantMonitoringHealthState {
    return {
      health: this.findLastByType("health.checked"),
      database: this.findLastByType("database.connectivity"),
      cache: this.findLastByType("cache.connectivity"),
    };
  }

  subscribe(subscriber: RadiantMonitoringSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  private findLastByType(type: RadiantMonitoringEventType): RadiantMonitoringEvent | undefined {
    for (let index = this.events.length - 1; index >= 0; index--) {
      if (this.events[index].type === type) return this.events[index];
    }
    return undefined;
  }
}
