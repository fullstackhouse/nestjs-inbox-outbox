import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Logger } from '@nestjs/common';
import { LoggerMiddleware } from '../../middleware/logger.middleware';
import { OutboxEventContext, OutboxListenerResult } from '../../middleware/outbox-middleware.interface';

vi.mock('@nestjs/common', async () => {
  const actual = await vi.importActual('@nestjs/common');
  return {
    ...actual,
    Logger: vi.fn().mockImplementation(() => ({
      log: vi.fn(),
      error: vi.fn(),
    })),
  };
});

describe('LoggerMiddleware', () => {
  let middleware: LoggerMiddleware;
  let mockLogger: { log: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const createContext = (overrides?: Partial<OutboxEventContext>): OutboxEventContext => ({
    eventName: 'TestEvent',
    eventPayload: { data: 'test' },
    eventId: 123,
    listenerName: 'TestListener',
    ...overrides,
  });

  beforeEach(() => {
    middleware = new LoggerMiddleware();
    mockLogger = (middleware as any).logger;
  });

  describe('beforeProcess', () => {
    it('should log event processing start', () => {
      const context = createContext();

      middleware.beforeProcess(context);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Processing TestEvent (id=123) → TestListener'
      );
    });
  });

  describe('afterProcess', () => {
    it('should log completion on success', () => {
      const context = createContext();
      const result: OutboxListenerResult = {
        success: true,
        durationMs: 42,
      };

      middleware.afterProcess(context, result);

      expect(mockLogger.log).toHaveBeenCalledWith(
        'Completed TestEvent (id=123) → TestListener in 42ms'
      );
    });

    it('should not log on failure', () => {
      const context = createContext();
      const result: OutboxListenerResult = {
        success: false,
        error: new Error('test'),
        durationMs: 10,
      };

      middleware.afterProcess(context, result);

      expect(mockLogger.log).not.toHaveBeenCalled();
    });
  });

  describe('onError', () => {
    it('should log error message', () => {
      const context = createContext();
      const error = new Error('Something went wrong');

      middleware.onError(context, error);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed TestEvent (id=123) → TestListener: Something went wrong'
      );
    });
  });
});
