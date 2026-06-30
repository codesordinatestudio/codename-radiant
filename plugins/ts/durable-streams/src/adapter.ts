import type { DurableStreamStore, StreamEvent } from "@codesordinatestudio/radiant-bun/core";
// Assuming a standard Durable Streams client API based on ElectricSQL specs
// @ts-ignore
import { Client } from "@durable-streams/client";

export class ElectricDurableStreamStore implements DurableStreamStore {
  private client: any;

  constructor(url: string, token?: string) {
    this.client = new Client({
      url,
      token,
    });
  }

  public async publish(collection: string, action: string, data: Record<string, any>): Promise<string> {
    const streamId = `radiant_${collection}`;
    await this.client.append(streamId, {
      action,
      data,
      timestamp: Date.now()
    });
    return "event-id-stub";
  }

  public async read(collection: string, lastEventId?: string): Promise<StreamEvent[]> {
    const streamId = `radiant_${collection}`;
    
    // Read from the durable stream from the given offset
    const options = lastEventId ? { after: lastEventId } : { limit: 1000 };
    const result = await this.client.read(streamId, options);
    
    return result.events.map((e: any) => ({
      id: e.id,
      collection,
      action: e.payload.action,
      data: e.payload.data,
      timestamp: e.payload.timestamp
    }));
  }
}
