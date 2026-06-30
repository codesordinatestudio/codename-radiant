export type RadiantMonitoringSeverity = "debug" | "info" | "warn" | "error" | "fatal";

export type RadiantMonitoringEventType =
  | "request.id"
  | "request.completed"
  | "request.error"
  | "health.checked"
  | "log"
  | "metric"
  | "trace"
  | "runtime.error"
  | "cache.connectivity"
  | "database.connectivity"
  | "audit";

export interface RadiantMonitoringEvent {
  id: string;
  type: RadiantMonitoringEventType;
  timestamp: string;
  requestId?: string;
  severity?: RadiantMonitoringSeverity;
  message?: string;
  durationMs?: number;
  method?: string;
  path?: string;
  status?: number;
  userId?: string;
  collection?: string;
  action?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface RadiantMonitoringQuery {
  limit?: number;
  since?: string;
  type?: RadiantMonitoringEventType | RadiantMonitoringEventType[];
  severity?: RadiantMonitoringSeverity | RadiantMonitoringSeverity[];
  requestId?: string;
  collection?: string;
  action?: string;
  source?: string;
  status?: number;
}

export interface RadiantMonitoringSummary {
  total: number;
  byType: Partial<Record<RadiantMonitoringEventType, number>>;
  bySeverity: Partial<Record<RadiantMonitoringSeverity, number>>;
  requests: {
    total: number;
    errors: number;
    averageDurationMs?: number;
  };
  lastEvent?: RadiantMonitoringEvent;
}

export interface RadiantMonitoringHealthState {
  health?: RadiantMonitoringEvent;
  database?: RadiantMonitoringEvent;
  cache?: RadiantMonitoringEvent;
}

export type RadiantMonitoringExporterKind =
  | "codesordinate-pro"
  | "log"
  | "opentelemetry"
  | "dashboard"
  | "webhook"
  | "custom";

export interface RadiantMonitoringExportBatch {
  id: string;
  exporterName: string;
  events: RadiantMonitoringEvent[];
  createdAt: string;
  attempt: number;
}

export interface RadiantMonitoringExporterError {
  exporterName: string;
  batch: RadiantMonitoringExportBatch;
  error: unknown;
}

export interface RadiantMonitoringExporter {
  name: string;
  kind?: RadiantMonitoringExporterKind;
  batchSize?: number;
  flushIntervalMs?: number;
  filter?: RadiantMonitoringQuery | ((event: RadiantMonitoringEvent) => boolean);
  export(batch: RadiantMonitoringExportBatch): void | Promise<void>;
  onError?(error: RadiantMonitoringExporterError): void | Promise<void>;
}

export interface RadiantMonitoringExporterDispatcherOptions {
  batchSize?: number;
  flushIntervalMs?: number;
  failOnExporterError?: boolean;
}

export interface RadiantMonitoringSubscriber {
  (event: RadiantMonitoringEvent): void | Promise<void>;
}

export function createMonitoringEvent(
  event: Omit<RadiantMonitoringEvent, "id" | "timestamp"> & Partial<Pick<RadiantMonitoringEvent, "id" | "timestamp">>,
): RadiantMonitoringEvent {
  return {
    id: event.id ?? crypto.randomUUID(),
    timestamp: event.timestamp ?? new Date().toISOString(),
    ...event,
  };
}

export function matchesMonitoringQuery(event: RadiantMonitoringEvent, options: RadiantMonitoringQuery = {}): boolean {
  if (options.since && event.timestamp <= options.since) return false;
  
  const includesFilter = <T extends string>(value: T | undefined, filter: T | T[] | undefined): boolean => {
    if (!filter) return true;
    if (!value) return false;
    return Array.isArray(filter) ? filter.includes(value) : value === filter;
  };

  if (!includesFilter(event.type, options.type)) return false;
  if (!includesFilter(event.severity, options.severity)) return false;
  if (options.requestId && event.requestId !== options.requestId) return false;
  if (options.collection && event.collection !== options.collection) return false;
  if (options.action && event.action !== options.action) return false;
  if (options.source && event.source !== options.source) return false;
  if (typeof options.status === "number" && event.status !== options.status) return false;
  return true;
}
