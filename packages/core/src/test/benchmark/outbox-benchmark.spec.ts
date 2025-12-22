import { vi, Mock } from 'vitest';
import { Logger } from '@nestjs/common';
import { DatabaseDriverFactory } from '../../driver/database-driver.factory';
import { DatabaseDriver } from '../../driver/database.driver';
import { RetryableOutboxEventPoller } from '../../poller/retryable-outbox-event.poller';
import { OutboxEventProcessor } from '../../processor/outbox-event.processor';
import { OutboxEventProcessorContract } from '../../processor/outbox-event-processor.contract';
import { EventConfigurationResolver } from '../../resolver/event-configuration.resolver';
import { TransactionalEventEmitter } from '../../emitter/transactional-event-emitter';
import { OutboxTransportEvent } from '../../model/outbox-transport-event.interface';
import { IListener } from '../../listener/contract/listener.interface';
import { OutboxMiddleware } from '../../middleware/outbox-middleware.interface';
import { createMockedDriver } from '../unit/mock/driver.mock';
import { createMockedDriverFactory } from '../unit/mock/driver-factory.mock';
import { createMockedOutboxOptionsFactory } from '../unit/mock/outbox-options.mock';
import { createMockedEventConfigurationResolver } from '../unit/mock/event-configuration-resolver.mock';

async function flushPromises(times = 20) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

describe('Outbox Benchmark Tests', () => {
  let mockedDriver: DatabaseDriver;
  let mockedDriverFactory: DatabaseDriverFactory;
  let mockLogger: Logger;

  beforeEach(() => {
    mockedDriver = createMockedDriver();
    mockedDriverFactory = createMockedDriverFactory(mockedDriver);
    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;
  });

  function createOutboxTransportEvent(id: number, eventName: string, retryCount = 0): OutboxTransportEvent {
    return {
      attemptAt: Date.now(),
      deliveredToListeners: [],
      eventName,
      eventPayload: { data: `payload-${id}` },
      expireAt: Date.now() + 60000,
      id,
      insertedAt: Date.now(),
      retryCount,
      status: 'pending',
    };
  }

  function createListener(name: string, shouldFail = false): IListener<any> {
    return {
      handle: vi.fn().mockImplementation(async () => {
        if (shouldFail) {
          throw new Error(`Listener ${name} failed`);
        }
      }),
      getName: vi.fn().mockReturnValue(name),
    };
  }

  describe('Parallel Event Processing', () => {
    it('should handle many events processed in parallel efficiently', async () => {
      const eventCount = 100;
      const listenerCount = 5;
      const outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
        {
          name: 'testEvent',
          listeners: {
            retentionPeriod: 60000,
            maxRetries: 3,
            maxExecutionTime: 5000,
          },
        },
      ]);

      const listeners = Array.from({ length: listenerCount }, (_, i) =>
        createListener(`listener-${i}`)
      );

      const processor = new OutboxEventProcessor(
        mockLogger,
        mockedDriverFactory,
        createMockedEventConfigurationResolver(),
        []
      );

      const events = Array.from({ length: eventCount }, (_, i) =>
        createOutboxTransportEvent(i, 'testEvent')
      );

      const startTime = performance.now();

      await Promise.all(
        events.map((event) =>
          processor.process(outboxOptions.events[0], event, listeners)
        )
      );

      const endTime = performance.now();
      const durationMs = endTime - startTime;
      const eventsPerSecond = (eventCount / durationMs) * 1000;

      console.log(`[Parallel Event Processing] ${eventCount} events with ${listenerCount} listeners each`);
      console.log(`  Total duration: ${durationMs.toFixed(2)}ms`);
      console.log(`  Events per second: ${eventsPerSecond.toFixed(2)}`);
      console.log(`  Avg time per event: ${(durationMs / eventCount).toFixed(2)}ms`);

      expect(mockedDriver.flush).toHaveBeenCalledTimes(eventCount);

      for (const listener of listeners) {
        expect(listener.handle).toHaveBeenCalledTimes(eventCount);
      }
    });

    it('should maintain correctness under high concurrency', async () => {
      const eventCount = 50;
      const listenerCount = 10;

      const outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
        {
          name: 'testEvent',
          listeners: {
            retentionPeriod: 60000,
            maxRetries: 3,
            maxExecutionTime: 5000,
          },
        },
      ]);

      const deliveredEvents = new Set<number>();
      const listeners = Array.from({ length: listenerCount }, (_, i) => ({
        handle: vi.fn().mockImplementation(async (payload: { data: string }) => {
          const eventId = parseInt(payload.data.split('-')[1], 10);
          deliveredEvents.add(eventId);
        }),
        getName: vi.fn().mockReturnValue(`listener-${i}`),
      }));

      const processor = new OutboxEventProcessor(
        mockLogger,
        mockedDriverFactory,
        createMockedEventConfigurationResolver(),
        []
      );

      const events = Array.from({ length: eventCount }, (_, i) =>
        createOutboxTransportEvent(i, 'testEvent')
      );

      await Promise.all(
        events.map((event) =>
          processor.process(outboxOptions.events[0], event, listeners)
        )
      );

      expect(deliveredEvents.size).toBe(eventCount);
    });
  });

  describe('Parallel Event Emission', () => {
    it('should handle many events emitted in parallel', async () => {
      const eventCount = 100;

      const outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
        {
          name: 'testEvent',
          listeners: {
            retentionPeriod: 60000,
            maxRetries: 3,
            maxExecutionTime: 5000,
          },
        },
      ]);

      (mockedDriver.createOutboxTransportEvent as ReturnType<typeof vi.fn>).mockImplementation(
        (name: string, event: any, expireAt: number, insertedAt: number) => ({
          id: Math.random(),
          eventName: name,
          eventPayload: event,
          deliveredToListeners: [],
          attemptAt: insertedAt,
          expireAt,
          insertedAt,
          retryCount: 0,
          status: 'pending',
        })
      );

      const emitter = new TransactionalEventEmitter(
        outboxOptions,
        mockedDriverFactory,
        createMockedEventConfigurationResolver(),
        []
      );

      const startTime = performance.now();

      await Promise.all(
        Array.from({ length: eventCount }, (_, i) =>
          emitter.emit({ name: 'testEvent', payload: { data: `event-${i}` } })
        )
      );

      const endTime = performance.now();
      const durationMs = endTime - startTime;
      const eventsPerSecond = (eventCount / durationMs) * 1000;

      console.log(`[Parallel Event Emission] ${eventCount} events emitted in parallel`);
      console.log(`  Total duration: ${durationMs.toFixed(2)}ms`);
      console.log(`  Events per second: ${eventsPerSecond.toFixed(2)}`);
      console.log(`  Avg time per event: ${(durationMs / eventCount).toFixed(2)}ms`);

      expect(mockedDriver.persist).toHaveBeenCalledTimes(eventCount);
      expect(mockedDriver.flush).toHaveBeenCalledTimes(eventCount);
    });

    it('should handle emission with middlewares', async () => {
      const eventCount = 50;
      let middlewareCallCount = 0;

      const middleware: OutboxMiddleware = {
        beforeEmit: vi.fn().mockImplementation(async (event) => {
          middlewareCallCount++;
          return event;
        }),
      };

      const outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
        {
          name: 'testEvent',
          listeners: {
            retentionPeriod: 60000,
            maxRetries: 3,
            maxExecutionTime: 5000,
          },
        },
      ]);

      (mockedDriver.createOutboxTransportEvent as ReturnType<typeof vi.fn>).mockImplementation(
        (name: string, event: any, expireAt: number, insertedAt: number) => ({
          id: Math.random(),
          eventName: name,
          eventPayload: event,
          deliveredToListeners: [],
          attemptAt: insertedAt,
          expireAt,
          insertedAt,
          retryCount: 0,
          status: 'pending',
        })
      );

      const emitter = new TransactionalEventEmitter(
        outboxOptions,
        mockedDriverFactory,
        createMockedEventConfigurationResolver(),
        [middleware]
      );

      await Promise.all(
        Array.from({ length: eventCount }, (_, i) =>
          emitter.emit({ name: 'testEvent', payload: { data: `event-${i}` } })
        )
      );

      expect(middlewareCallCount).toBe(eventCount);
    });
  });

  describe('DLQ Events Handling', () => {
    it('should handle many DLQ events efficiently', async () => {
      vi.useFakeTimers();

      const dlqEventCount = 100;
      let dlqHandlerCallCount = 0;

      const middleware: OutboxMiddleware = {
        onDeadLetter: vi.fn().mockImplementation(async () => {
          dlqHandlerCallCount++;
        }),
      };

      const outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
        {
          name: 'testEvent',
          listeners: {
            retentionPeriod: 60000,
            maxRetries: 3,
            maxExecutionTime: 5000,
          },
        },
      ]);

      const deadLetteredEvents = Array.from({ length: dlqEventCount }, (_, i) => ({
        ...createOutboxTransportEvent(i, 'testEvent', 5),
        status: 'failed' as const,
        attemptAt: null,
      }));

      (mockedDriver.findAndExtendReadyToRetryEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
        pendingEvents: [],
        deadLetteredEvents,
      });

      const mockTransactionalEventEmitter = {
        getListeners: vi.fn().mockReturnValue([]),
      } as unknown as TransactionalEventEmitter;

      const mockOutboxEventProcessor: OutboxEventProcessorContract = {
        process: vi.fn().mockResolvedValue(undefined),
      };

      const poller = new RetryableOutboxEventPoller(
        outboxOptions,
        mockedDriverFactory,
        mockOutboxEventProcessor,
        mockTransactionalEventEmitter,
        {} as EventConfigurationResolver,
        mockLogger,
        undefined,
        [middleware]
      );

      await poller.onModuleInit();

      vi.advanceTimersByTime(outboxOptions.pollingInterval);
      await flushPromises(200);

      console.log(`[DLQ Events Handling] ${dlqEventCount} dead-lettered events`);
      console.log(`  Middleware onDeadLetter calls: ${dlqHandlerCallCount}`);

      expect(middleware.onDeadLetter).toHaveBeenCalledTimes(dlqEventCount);

      await poller.onModuleDestroy();
      vi.useRealTimers();
    });

    it('should continue processing when DLQ handler throws', async () => {
      vi.useFakeTimers();

      const dlqEventCount = 10;
      let successfulCalls = 0;

      const middleware: OutboxMiddleware = {
        onDeadLetter: vi.fn().mockImplementation(async (context) => {
          if (context.eventId % 2 === 0) {
            throw new Error('DLQ handler error');
          }
          successfulCalls++;
        }),
      };

      const outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
        {
          name: 'testEvent',
          listeners: {
            retentionPeriod: 60000,
            maxRetries: 3,
            maxExecutionTime: 5000,
          },
        },
      ]);

      const deadLetteredEvents = Array.from({ length: dlqEventCount }, (_, i) => ({
        ...createOutboxTransportEvent(i, 'testEvent', 5),
        status: 'failed' as const,
        attemptAt: null,
      }));

      (mockedDriver.findAndExtendReadyToRetryEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
        pendingEvents: [],
        deadLetteredEvents,
      });

      const mockTransactionalEventEmitter = {
        getListeners: vi.fn().mockReturnValue([]),
      } as unknown as TransactionalEventEmitter;

      const mockOutboxEventProcessor: OutboxEventProcessorContract = {
        process: vi.fn().mockResolvedValue(undefined),
      };

      const poller = new RetryableOutboxEventPoller(
        outboxOptions,
        mockedDriverFactory,
        mockOutboxEventProcessor,
        mockTransactionalEventEmitter,
        {} as EventConfigurationResolver,
        mockLogger,
        undefined,
        [middleware]
      );

      await poller.onModuleInit();
      vi.advanceTimersByTime(outboxOptions.pollingInterval);
      await flushPromises(50);

      expect(middleware.onDeadLetter).toHaveBeenCalledTimes(dlqEventCount);
      expect(successfulCalls).toBe(dlqEventCount / 2);
      expect(mockLogger.error).toHaveBeenCalled();

      await poller.onModuleDestroy();
      vi.useRealTimers();
    });
  });

  describe('Event Retries', () => {
    it('should handle many retried events efficiently', async () => {
      const eventCount = 50;
      const failingListenerCount = 3;
      const successfulListenerCount = 2;

      const outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
        {
          name: 'testEvent',
          listeners: {
            retentionPeriod: 60000,
            maxRetries: 5,
            maxExecutionTime: 5000,
          },
        },
      ]);

      const failingListeners = Array.from({ length: failingListenerCount }, (_, i) =>
        createListener(`failing-listener-${i}`, true)
      );
      const successfulListeners = Array.from({ length: successfulListenerCount }, (_, i) =>
        createListener(`successful-listener-${i}`, false)
      );
      const allListeners = [...failingListeners, ...successfulListeners];

      const processor = new OutboxEventProcessor(
        mockLogger,
        mockedDriverFactory,
        createMockedEventConfigurationResolver(),
        []
      );

      const events = Array.from({ length: eventCount }, (_, i) =>
        createOutboxTransportEvent(i, 'testEvent', 2)
      );

      const startTime = performance.now();

      await Promise.all(
        events.map((event) =>
          processor.process(outboxOptions.events[0], event, allListeners)
        )
      );

      const endTime = performance.now();
      const durationMs = endTime - startTime;

      console.log(`[Event Retries] ${eventCount} events with ${failingListenerCount} failing + ${successfulListenerCount} successful listeners`);
      console.log(`  Total duration: ${durationMs.toFixed(2)}ms`);
      console.log(`  Avg time per event: ${(durationMs / eventCount).toFixed(2)}ms`);

      expect(mockedDriver.persist).toHaveBeenCalledTimes(eventCount);
      expect(mockedDriver.remove).not.toHaveBeenCalled();
    });

    it('should track partial delivery correctly during retries', async () => {
      const eventCount = 20;

      const outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
        {
          name: 'testEvent',
          listeners: {
            retentionPeriod: 60000,
            maxRetries: 5,
            maxExecutionTime: 5000,
          },
        },
      ]);

      const persistedEvents: OutboxTransportEvent[] = [];
      (mockedDriver.persist as ReturnType<typeof vi.fn>).mockImplementation((event: OutboxTransportEvent) => {
        persistedEvents.push({ ...event });
      });

      const listeners: IListener<any>[] = [
        createListener('always-succeeds', false),
        createListener('always-fails', true),
      ];

      const processor = new OutboxEventProcessor(
        mockLogger,
        mockedDriverFactory,
        createMockedEventConfigurationResolver(),
        []
      );

      const events = Array.from({ length: eventCount }, (_, i) =>
        createOutboxTransportEvent(i, 'testEvent', 1)
      );

      await Promise.all(
        events.map((event) =>
          processor.process(outboxOptions.events[0], event, listeners)
        )
      );

      expect(persistedEvents.length).toBe(eventCount);
      for (const event of persistedEvents) {
        expect(event.deliveredToListeners).toContain('always-succeeds');
        expect(event.deliveredToListeners).not.toContain('always-fails');
      }
    });

    it('should handle events with different retry counts', async () => {
      const outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
        {
          name: 'testEvent',
          listeners: {
            retentionPeriod: 60000,
            maxRetries: 5,
            maxExecutionTime: 5000,
          },
        },
      ]);

      const listener = createListener('test-listener', false);

      const processor = new OutboxEventProcessor(
        mockLogger,
        mockedDriverFactory,
        createMockedEventConfigurationResolver(),
        []
      );

      const events = [
        createOutboxTransportEvent(1, 'testEvent', 0),
        createOutboxTransportEvent(2, 'testEvent', 1),
        createOutboxTransportEvent(3, 'testEvent', 2),
        createOutboxTransportEvent(4, 'testEvent', 3),
        createOutboxTransportEvent(5, 'testEvent', 4),
      ];

      const startTime = performance.now();

      await Promise.all(
        events.map((event) =>
          processor.process(outboxOptions.events[0], event, [listener])
        )
      );

      const endTime = performance.now();

      console.log(`[Mixed Retry Counts] 5 events with retry counts 0-4`);
      console.log(`  Total duration: ${(endTime - startTime).toFixed(2)}ms`);

      expect(mockedDriver.remove).toHaveBeenCalledTimes(5);
      expect(listener.handle).toHaveBeenCalledTimes(5);
    });
  });

  describe('Combined Load Test', () => {
    it('should handle realistic mixed workload', async () => {
      vi.useFakeTimers();

      const pendingEventCount = 50;
      const dlqEventCount = 10;
      const listenerCount = 3;

      const outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
        {
          name: 'testEvent',
          listeners: {
            retentionPeriod: 60000,
            maxRetries: 3,
            maxExecutionTime: 5000,
          },
        },
      ]);

      const dlqMiddleware: OutboxMiddleware = {
        onDeadLetter: vi.fn(),
      };

      const pendingEvents = Array.from({ length: pendingEventCount }, (_, i) =>
        createOutboxTransportEvent(i, 'testEvent', 1)
      );

      const deadLetteredEvents = Array.from({ length: dlqEventCount }, (_, i) => ({
        ...createOutboxTransportEvent(i + pendingEventCount, 'testEvent', 5),
        status: 'failed' as const,
        attemptAt: null,
      }));

      (mockedDriver.findAndExtendReadyToRetryEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
        pendingEvents,
        deadLetteredEvents,
      });

      const listeners = Array.from({ length: listenerCount }, (_, i) =>
        createListener(`listener-${i}`, false)
      );

      const mockTransactionalEventEmitter = {
        getListeners: vi.fn().mockReturnValue(listeners),
      } as unknown as TransactionalEventEmitter;

      const mockProcessor: OutboxEventProcessorContract = {
        process: vi.fn().mockResolvedValue(undefined),
      };

      const poller = new RetryableOutboxEventPoller(
        outboxOptions,
        mockedDriverFactory,
        mockProcessor,
        mockTransactionalEventEmitter,
        {} as EventConfigurationResolver,
        mockLogger,
        undefined,
        [dlqMiddleware]
      );

      await poller.onModuleInit();
      vi.advanceTimersByTime(outboxOptions.pollingInterval);
      await flushPromises(50);

      console.log(`[Combined Load Test] ${pendingEventCount} pending + ${dlqEventCount} DLQ events`);
      console.log(`  Processor calls: ${(mockProcessor.process as ReturnType<typeof vi.fn>).mock.calls.length}`);
      console.log(`  DLQ handler calls: ${(dlqMiddleware.onDeadLetter as ReturnType<typeof vi.fn>).mock.calls.length}`);

      expect(mockProcessor.process).toHaveBeenCalledTimes(pendingEventCount);
      expect(dlqMiddleware.onDeadLetter).toHaveBeenCalledTimes(dlqEventCount);

      await poller.onModuleDestroy();
      vi.useRealTimers();
    });

    it('should handle graceful shutdown during processing', async () => {
      vi.useFakeTimers();

      const eventCount = 20;

      const outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
        {
          name: 'testEvent',
          listeners: {
            retentionPeriod: 60000,
            maxRetries: 3,
            maxExecutionTime: 5000,
          },
        },
      ]);

      const pendingEvents = Array.from({ length: eventCount }, (_, i) =>
        createOutboxTransportEvent(i, 'testEvent', 0)
      );

      (mockedDriver.findAndExtendReadyToRetryEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
        pendingEvents,
        deadLetteredEvents: [],
      });

      const mockTransactionalEventEmitter = {
        getListeners: vi.fn().mockReturnValue([createListener('test')]),
      } as unknown as TransactionalEventEmitter;

      const resolvers: (() => void)[] = [];
      const mockProcessor: OutboxEventProcessorContract = {
        process: vi.fn().mockImplementation(() => {
          return new Promise<void>((resolve) => {
            resolvers.push(resolve);
          });
        }),
      };

      const poller = new RetryableOutboxEventPoller(
        outboxOptions,
        mockedDriverFactory,
        mockProcessor,
        mockTransactionalEventEmitter,
        {} as EventConfigurationResolver,
        mockLogger
      );

      await poller.onModuleInit();
      vi.advanceTimersByTime(outboxOptions.pollingInterval);
      await flushPromises();

      const shutdownPromise = poller.onModuleDestroy();

      resolvers.forEach((resolve) => resolve());
      await shutdownPromise;

      expect(mockLogger.log).toHaveBeenCalledWith('RetryableOutboxEventPoller shutdown complete.');
      vi.useRealTimers();
    });
  });
});
