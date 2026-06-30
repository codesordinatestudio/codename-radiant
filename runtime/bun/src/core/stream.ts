export interface StreamEvent {
  id: string; // Event sequence ID (e.g., timestamp-based)
  collection: string;
  action: string;
  data: Record<string, any>;
  timestamp: number;
}

export interface DurableStreamStore {
  publish(collection: string, action: string, data: Record<string, any>): Promise<string>;
  read(collection: string, lastEventId?: string): Promise<StreamEvent[]>;
}

/**
 * In-memory implementation of DurableStreamStore.
 * [Development Only] This uses a local array ring buffer.
 * It does not scale across multiple servers and loses data on restart.
 * Use @codesordinatestudio/radiant-plugin-durable-streams for production.
 */
export class MemoryStreamStore implements DurableStreamStore {
  // A simple in-memory ring buffer (default max capacity 1000 per collection)
  private streams: Map<string, StreamEvent[]> = new Map();
  private maxCapacity: number;

  constructor(maxCapacity = 1000) {
    this.maxCapacity = maxCapacity;
  }

  async publish(collection: string, action: string, data: Record<string, any>): Promise<string> {
    if (!this.streams.has(collection)) {
      this.streams.set(collection, []);
    }

    const stream = this.streams.get(collection)!;
    const timestamp = Date.now();
    
    // Simple ID generator: timestamp + random suffix to prevent collisions
    const id = `${timestamp}-${Math.random().toString(36).substring(2, 7)}`;

    const event: StreamEvent = {
      id,
      collection,
      action,
      data,
      timestamp,
    };

    stream.push(event);

    // Enforce Ring Buffer capacity to prevent memory leaks
    if (stream.length > this.maxCapacity) {
      stream.shift();
    }

    return id;
  }

  async read(collection: string, lastEventId?: string): Promise<StreamEvent[]> {
    const stream = this.streams.get(collection) || [];
    
    if (!lastEventId) {
      return stream;
    }

    const index = stream.findIndex((e) => e.id === lastEventId);
    
    // If the event is not found, or it's the last event, return everything after it
    // If not found, we return the whole stream (they might have provided a really old ID that got pushed out)
    if (index === -1) {
      return stream;
    }

    return stream.slice(index + 1);
  }
}
