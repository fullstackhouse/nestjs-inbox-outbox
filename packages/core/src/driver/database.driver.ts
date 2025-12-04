import { OutboxTransportEvent } from '../model/outbox-transport-event.interface';
import { DatabaseDriverPersister } from './database.driver-persister';

export interface DatabaseDriver extends DatabaseDriverPersister {
  createOutboxTransportEvent(eventName: string, eventPayload: any, expireAt: number, readyToRetryAfter: number | null): OutboxTransportEvent;
  findAndExtendReadyToRetryEvents(limit: number): Promise<OutboxTransportEvent[]>;
}
