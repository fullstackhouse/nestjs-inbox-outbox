import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListenerDiscovery } from '../../listener/discovery/listener.discovery';
import { TransactionalEventEmitter } from '../../emitter/transactional-event-emitter';
import { OnEvent, ON_EVENT_METADATA_KEY } from '../../listener/discovery/on-event.decorator';

describe('ListenerDiscovery', () => {
  let mockEmitter: Partial<TransactionalEventEmitter>;
  let mockDiscoveryService: any;
  let mockLogger: any;
  let discovery: ListenerDiscovery;

  beforeEach(() => {
    mockEmitter = {
      addListener: vi.fn(),
    };

    mockDiscoveryService = {
      getProviders: vi.fn().mockReturnValue([]),
    };

    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    discovery = new ListenerDiscovery(
      mockEmitter as TransactionalEventEmitter,
      mockDiscoveryService,
      mockLogger,
    );
  });

  describe('@OnEvent decorator', () => {
    it('should register method-level listeners', () => {
      class EventHandler {
        @OnEvent('TestEvent')
        handleTestEvent() {}
      }

      const instance = new EventHandler();
      mockDiscoveryService.getProviders.mockReturnValue([
        { metatype: EventHandler, instance },
      ]);

      discovery.onModuleInit();

      expect(mockEmitter.addListener).toHaveBeenCalledTimes(1);
      expect(mockEmitter.addListener).toHaveBeenCalledWith(
        'TestEvent',
        expect.objectContaining({
          getName: expect.any(Function),
          handle: expect.any(Function),
        }),
      );
    });

    it('should register multiple method-level listeners from same class', () => {
      class MultiEventHandler {
        @OnEvent('FirstEvent')
        handleFirst() {}

        @OnEvent('SecondEvent')
        handleSecond() {}
      }

      const instance = new MultiEventHandler();
      mockDiscoveryService.getProviders.mockReturnValue([
        { metatype: MultiEventHandler, instance },
      ]);

      discovery.onModuleInit();

      expect(mockEmitter.addListener).toHaveBeenCalledTimes(2);
      expect(mockEmitter.addListener).toHaveBeenCalledWith('FirstEvent', expect.any(Object));
      expect(mockEmitter.addListener).toHaveBeenCalledWith('SecondEvent', expect.any(Object));
    });

    it('should generate unique listener names for method handlers', () => {
      class EventHandler {
        @OnEvent('TestEvent')
        handleTestEvent() {}
      }

      const instance = new EventHandler();
      mockDiscoveryService.getProviders.mockReturnValue([
        { metatype: EventHandler, instance },
      ]);

      discovery.onModuleInit();

      const adapter = (mockEmitter.addListener as any).mock.calls[0][1];
      expect(adapter.getName()).toBe('EventHandler.handleTestEvent');
    });

    it('should invoke the correct method when adapter handles event', async () => {
      const handledEvents: any[] = [];

      class EventHandler {
        @OnEvent('TestEvent')
        async handleTestEvent(event: any) {
          handledEvents.push(event);
        }
      }

      const instance = new EventHandler();
      mockDiscoveryService.getProviders.mockReturnValue([
        { metatype: EventHandler, instance },
      ]);

      discovery.onModuleInit();

      const adapter = (mockEmitter.addListener as any).mock.calls[0][1];
      await adapter.handle({ id: 1 });

      expect(handledEvents).toHaveLength(1);
      expect(handledEvents[0]).toEqual({ id: 1 });
    });
  });

  describe('duplicate listener detection', () => {
    it('should allow same method names across different classes', () => {
      class FirstHandler {
        @OnEvent('Event1')
        handleEvent() {}
      }

      class SecondHandler {
        @OnEvent('Event2')
        handleEvent() {}
      }

      Reflect.defineMetadata(ON_EVENT_METADATA_KEY, [
        { eventName: 'Event1', methodName: 'handleEvent' },
      ], FirstHandler);

      Reflect.defineMetadata(ON_EVENT_METADATA_KEY, [
        { eventName: 'Event2', methodName: 'handleEvent' },
      ], SecondHandler);

      mockDiscoveryService.getProviders.mockReturnValue([
        { metatype: FirstHandler, instance: new FirstHandler() },
        { metatype: SecondHandler, instance: new SecondHandler() },
      ]);

      discovery.onModuleInit();

      expect(mockEmitter.addListener).toHaveBeenCalledTimes(2);
    });
  });
});
