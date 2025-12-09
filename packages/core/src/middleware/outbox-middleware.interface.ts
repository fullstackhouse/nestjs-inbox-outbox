import { IListener } from '../listener/contract/listener.interface';
import { OutboxTransportEvent } from '../model/outbox-transport-event.interface';
import { OutboxModuleEventOptions } from '../outbox.module-definition';

export interface OutboxMiddlewareContext {
  event: OutboxTransportEvent;
  listener: IListener<any>;
  eventOptions: OutboxModuleEventOptions;
}

export interface OutboxMiddleware {
  name: string;
  process(
    context: OutboxMiddlewareContext,
    next: () => Promise<void>,
  ): Promise<void>;
}
