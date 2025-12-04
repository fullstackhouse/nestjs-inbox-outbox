import { vi } from 'vitest';
import { DatabaseDriverFactory } from "../../driver/database-driver.factory";
import { DatabaseDriver } from "../../driver/database.driver";
import { OutboxModuleOptions } from "../../outbox.module-definition";
import { IListener } from "../../listener/contract/listener.interface";
import { OutboxTransportEvent } from "../../model/outbox-transport-event.interface";
import { OutboxEventProcessorContract } from "../../processor/outbox-event-processor.contract";
import { OutboxEventProcessor } from "../../processor/outbox-event.processor";
import { EventConfigurationResolverContract } from "../../resolver/event-configuration-resolver.contract";
import { createMockedDriverFactory } from "./mock/driver-factory.mock";
import { createMockedDriver } from "./mock/driver.mock";
import { createMockedEventConfigurationResolver } from "./mock/event-configuration-resolver.mock";
import { createMockedOutboxEventProcessor } from "./mock/outbox-event-processor.mock";
import { createMockedOutboxOptionsFactory } from "./mock/outbox-options.mock";

describe('OutboxEventProcessor', () => {

    let mockedDriver: DatabaseDriver;
    let mockedDriverFactory: DatabaseDriverFactory;
    let outboxOptions: OutboxModuleOptions;
    let mockedOutboxEventProcessor: OutboxEventProcessorContract;
    let mockedEventConfigurationResolver: EventConfigurationResolverContract;
    let mockLogger: any; 
    
    beforeEach(() => {
      mockedDriver = createMockedDriver();
      mockedDriverFactory = createMockedDriverFactory(mockedDriver);
      outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, []);
      mockedOutboxEventProcessor = createMockedOutboxEventProcessor();
      mockedEventConfigurationResolver = createMockedEventConfigurationResolver();
      mockLogger = {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
      }; 
    });

    it('Should process the event and deliver it to the all listeners, resulting in calling remove on driver', async () => {

        outboxOptions.events = [
            {
              name: 'newEvent',
              listeners: {
                expiresAtTTL: 1000,
                readyToRetryAfterTTL: 1000,
                maxExecutionTimeTTL: 1000,
              },
            },
          ];

        const firstListener : IListener<any> = {
            handle: vi.fn().mockReturnValue({}),
            getName: vi.fn().mockReturnValue('listener'),
        };

        const secondListener : IListener<any> = {
            handle: vi.fn().mockReturnValue({}),
            getName: vi.fn().mockReturnValue('listener'),
        };
        

        const outboxEventProcessor = new OutboxEventProcessor(
            mockLogger,
            mockedDriverFactory,
            mockedEventConfigurationResolver
        );

        const outboxTransportEvent : OutboxTransportEvent = {
            readyToRetryAfter: new Date().getTime(),
            deliveredToListeners: [],
            eventName: 'newEvent',
            eventPayload: {},
            expireAt: new Date().getTime() + 1000,
            id: 1,
            insertedAt: new Date().getTime(),
        };

        await outboxEventProcessor.process(outboxOptions.events[0], outboxTransportEvent, [firstListener, secondListener]);

        
        expect(mockedDriver.remove).toHaveBeenCalledTimes(1);
        expect(mockedDriver.flush).toHaveBeenCalledTimes(1);

    });

    it('Should process the event and deliver it to the all listeners, one with error, resulting in calling in not calling remove on driver', async () => {

        outboxOptions.events = [
            {
              name: 'newEvent',
              listeners: {
                expiresAtTTL: 1000,
                readyToRetryAfterTTL: 1000,
                maxExecutionTimeTTL: 1000,
              },
            },
          ];

        const firstListener : IListener<any> = {
            handle: vi.fn().mockReturnValue({}),
            getName: vi.fn().mockReturnValue('listener'),
        };

        const secondListener : IListener<any> = {
            handle: vi.fn().mockRejectedValue({}),
            getName: vi.fn().mockReturnValue('listener'),
        };
        

        const outboxEventProcessor = new OutboxEventProcessor(
            mockLogger,
            mockedDriverFactory,
            mockedEventConfigurationResolver
        );

        const outboxTransportEvent : OutboxTransportEvent = {
            readyToRetryAfter: new Date().getTime(),
            deliveredToListeners: [],
            eventName: 'newEvent',
            eventPayload: {},
            expireAt: new Date().getTime() + 1000,
            id: 1,
            insertedAt: new Date().getTime(),
        };

        await outboxEventProcessor.process(outboxOptions.events[0], outboxTransportEvent, [firstListener, secondListener]);

        expect(mockedDriver.remove).not.toHaveBeenCalled();
        expect(mockedDriver.persist).toHaveBeenCalledTimes(1);
        expect(mockedDriver.flush).toHaveBeenCalledTimes(1);

    });
});