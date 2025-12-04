import { OutboxModuleEventOptions } from "../outbox.module-definition";
import { IListener } from "../listener/contract/listener.interface";
import { OutboxTransportEvent } from "../model/outbox-transport-event.interface";

export const OUTBOX_EVENT_PROCESSOR_TOKEN = 'OUTBOX_EVENT_PROCESSOR_TOKEN';

export interface OutboxEventProcessorContract {
    process<TPayload>(eventOptions: OutboxModuleEventOptions, outboxTransportEvent: OutboxTransportEvent, listeners: IListener<TPayload>[]): Promise<void>;
}