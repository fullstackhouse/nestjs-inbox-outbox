import { describe, it, expect, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { OutboxEventProcessor } from '../../processor/outbox-event.processor';
import { OutboxMiddleware, OutboxMiddlewareContext } from '../../middleware/outbox-middleware.interface';
import { OutboxModuleEventOptions } from '../../outbox.module-definition';
import { IListener } from '../../listener/contract/listener.interface';
import { OutboxTransportEvent } from '../../model/outbox-transport-event.interface';
import { DatabaseDriverFactory } from '../../driver/database-driver.factory';
import { EventConfigurationResolver } from '../../resolver/event-configuration.resolver';

describe('OutboxEventProcessor with Middleware', () => {
  const createMockListener = (name: string): IListener<any> => ({
    getName: () => name,
    handle: vi.fn().mockResolvedValue(undefined),
  });

  const createMockEvent = (): OutboxTransportEvent => ({
    id: 'test-id',
    eventName: 'TestEvent',
    eventPayload: { test: 'data' },
    createdAt: new Date(),
    expiresAt: new Date(),
    deliveredToListeners: [],
  });

  const createMockEventOptions = (): OutboxModuleEventOptions => ({
    name: 'TestEvent',
    listeners: {
      expiresAtTTL: 10000,
      readyToRetryAfterTTL: 5000,
      maxExecutionTimeTTL: 5000,
    },
  });

  it('should execute middleware chain before listener', async () => {
    const executionOrder: string[] = [];

    const middleware1: OutboxMiddleware = {
      name: 'middleware1',
      process: async (context: OutboxMiddlewareContext, next: () => Promise<void>) => {
        executionOrder.push('middleware1-before');
        await next();
        executionOrder.push('middleware1-after');
      },
    };

    const middleware2: OutboxMiddleware = {
      name: 'middleware2',
      process: async (context: OutboxMiddlewareContext, next: () => Promise<void>) => {
        executionOrder.push('middleware2-before');
        await next();
        executionOrder.push('middleware2-after');
      },
    };

    const listener = createMockListener('test-listener');
    const originalHandle = listener.handle;
    listener.handle = vi.fn(async (...args) => {
      executionOrder.push('listener');
      return originalHandle(...args);
    });

    const mockDriverFactory = {
      create: vi.fn().mockReturnValue({
        persist: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as DatabaseDriverFactory;

    const mockResolver = {
      resolve: vi.fn(),
    } as unknown as EventConfigurationResolver;

    const logger = new Logger();
    const processor = new OutboxEventProcessor(
      logger,
      mockDriverFactory,
      mockResolver,
      [middleware1, middleware2],
    );

    const event = createMockEvent();
    const eventOptions = createMockEventOptions();

    await processor.process(eventOptions, event, [listener]);

    expect(executionOrder).toEqual([
      'middleware1-before',
      'middleware2-before',
      'listener',
      'middleware2-after',
      'middleware1-after',
    ]);
  });

  it('should work without middlewares', async () => {
    const listener = createMockListener('test-listener');

    const mockDriverFactory = {
      create: vi.fn().mockReturnValue({
        persist: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as DatabaseDriverFactory;

    const mockResolver = {
      resolve: vi.fn(),
    } as unknown as EventConfigurationResolver;

    const logger = new Logger();
    const processor = new OutboxEventProcessor(
      logger,
      mockDriverFactory,
      mockResolver,
      undefined,
    );

    const event = createMockEvent();
    const eventOptions = createMockEventOptions();

    await processor.process(eventOptions, event, [listener]);

    expect(listener.handle).toHaveBeenCalledWith(event.eventPayload, event.eventName);
  });

  it('should propagate errors through middleware chain', async () => {
    const errorMiddleware: OutboxMiddleware = {
      name: 'error-catcher',
      process: async (context: OutboxMiddlewareContext, next: () => Promise<void>) => {
        try {
          await next();
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Listener error');
          throw error;
        }
      },
    };

    const listener = createMockListener('failing-listener');
    listener.handle = vi.fn().mockRejectedValue(new Error('Listener error'));

    const mockDriverFactory = {
      create: vi.fn().mockReturnValue({
        persist: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as DatabaseDriverFactory;

    const mockResolver = {
      resolve: vi.fn(),
    } as unknown as EventConfigurationResolver;

    const logger = new Logger();
    vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const processor = new OutboxEventProcessor(
      logger,
      mockDriverFactory,
      mockResolver,
      [errorMiddleware],
    );

    const event = createMockEvent();
    const eventOptions = createMockEventOptions();

    await processor.process(eventOptions, event, [listener]);

    expect(listener.handle).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('should provide correct context to middleware', async () => {
    let capturedContext: OutboxMiddlewareContext | undefined;

    const contextCapturingMiddleware: OutboxMiddleware = {
      name: 'context-capturer',
      process: async (context: OutboxMiddlewareContext, next: () => Promise<void>) => {
        capturedContext = context;
        await next();
      },
    };

    const listener = createMockListener('test-listener');
    const event = createMockEvent();
    const eventOptions = createMockEventOptions();

    const mockDriverFactory = {
      create: vi.fn().mockReturnValue({
        persist: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        flush: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as DatabaseDriverFactory;

    const mockResolver = {
      resolve: vi.fn(),
    } as unknown as EventConfigurationResolver;

    const logger = new Logger();
    const processor = new OutboxEventProcessor(
      logger,
      mockDriverFactory,
      mockResolver,
      [contextCapturingMiddleware],
    );

    await processor.process(eventOptions, event, [listener]);

    expect(capturedContext).toBeDefined();
    expect(capturedContext?.event).toBe(event);
    expect(capturedContext?.listener).toBe(listener);
    expect(capturedContext?.eventOptions).toBe(eventOptions);
  });
});
