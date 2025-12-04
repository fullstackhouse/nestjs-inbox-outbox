export interface OutboxTransportEvent {
  id: number;
  eventName: string;
  eventPayload: any;
  deliveredToListeners: string[];
  readyToRetryAfter: number | null;
  expireAt: number;
  insertedAt: number;
}
