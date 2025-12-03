import { Logger } from '@nestjs/common';
import { ExpiredEventCleaner } from '../../cleaner/expired-event.cleaner';
import { DatabaseDriverFactory } from '../../driver/database-driver.factory';
import { DatabaseDriver } from '../../driver/database.driver';
import { InboxOutboxModuleOptions } from '../../inbox-outbox.module-definition';
import { EventConfigurationResolver } from '../../resolver/event-configuration.resolver';
import { createMockedDriverFactory } from './mock/driver-factory.mock';
import { createMockedDriver } from './mock/driver.mock';
import { createMockedInboxOutboxOptionsFactory } from './mock/inbox-outbox-options.mock';

describe('ExpiredEventCleaner', () => {
  let mockedDriver: DatabaseDriver;
  let mockedDriverFactory: DatabaseDriverFactory;
  let inboxOutboxOptions: InboxOutboxModuleOptions;
  let mockLogger: Logger;
  let mockEventConfigurationResolver: EventConfigurationResolver;

  beforeEach(() => {
    jest.useFakeTimers();
    mockedDriver = createMockedDriver();
    mockedDriverFactory = createMockedDriverFactory(mockedDriver);
    inboxOutboxOptions = createMockedInboxOutboxOptionsFactory(mockedDriverFactory, [
      {
        name: 'testEvent',
        listeners: {
          expiresAtTTL: 1000,
          readyToRetryAfterTTL: 1000,
          maxExecutionTimeTTL: 1000,
        },
      },
    ]);
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as Logger;

    mockEventConfigurationResolver = {} as EventConfigurationResolver;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function createCleaner(options?: Partial<InboxOutboxModuleOptions>) {
    const mergedOptions = { ...inboxOutboxOptions, ...options };
    return new ExpiredEventCleaner(
      mergedOptions,
      mockedDriverFactory,
      mockEventConfigurationResolver,
      mockLogger,
    );
  }

  describe('onModuleInit', () => {
    it('should not start cleanup when disabled', async () => {
      const cleaner = createCleaner({
        expiredEventCleanup: {
          enabled: false,
          intervalMilliseconds: 1000,
          batchSize: 100,
        },
      });

      await cleaner.onModuleInit();

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(mockedDriver.deleteExpiredEvents).not.toHaveBeenCalled();
    });

    it('should not start cleanup when options are undefined', async () => {
      const cleaner = createCleaner({ expiredEventCleanup: undefined });

      await cleaner.onModuleInit();

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(mockedDriver.deleteExpiredEvents).not.toHaveBeenCalled();
    });

    it('should start cleanup when enabled', async () => {
      (mockedDriver.deleteExpiredEvents as jest.Mock).mockResolvedValue(0);

      const cleaner = createCleaner({
        expiredEventCleanup: {
          enabled: true,
          intervalMilliseconds: 1000,
          batchSize: 100,
        },
      });

      await cleaner.onModuleInit();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('ExpiredEventCleaner started'),
      );

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(mockedDriver.deleteExpiredEvents).toHaveBeenCalledWith(100);
    });

    it('should log when events are deleted', async () => {
      (mockedDriver.deleteExpiredEvents as jest.Mock).mockResolvedValueOnce(5).mockResolvedValue(0);

      const cleaner = createCleaner({
        expiredEventCleanup: {
          enabled: true,
          intervalMilliseconds: 1000,
          batchSize: 100,
        },
      });

      await cleaner.onModuleInit();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('deleted 5 expired event(s)'),
      );
    });

    it('should continue deleting in batches until all expired events are removed', async () => {
      (mockedDriver.deleteExpiredEvents as jest.Mock)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(50)
        .mockResolvedValue(0);

      const cleaner = createCleaner({
        expiredEventCleanup: {
          enabled: true,
          intervalMilliseconds: 1000,
          batchSize: 100,
        },
      });

      await cleaner.onModuleInit();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockedDriver.deleteExpiredEvents).toHaveBeenCalledTimes(3);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('deleted 250 expired event(s)'),
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should stop cleanup after shutdown', async () => {
      (mockedDriver.deleteExpiredEvents as jest.Mock).mockResolvedValue(0);

      const cleaner = createCleaner({
        expiredEventCleanup: {
          enabled: true,
          intervalMilliseconds: 1000,
          batchSize: 100,
        },
      });

      await cleaner.onModuleInit();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      const callCountBeforeShutdown = (mockedDriver.deleteExpiredEvents as jest.Mock).mock.calls
        .length;

      await cleaner.onModuleDestroy();

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      const callCountAfterShutdown = (mockedDriver.deleteExpiredEvents as jest.Mock).mock.calls
        .length;
      expect(callCountAfterShutdown).toBe(callCountBeforeShutdown);
    });

    it('should wait for in-flight cleanup to complete', async () => {
      let resolveDelete: (value: number) => void;
      const deletePromise = new Promise<number>(resolve => {
        resolveDelete = resolve;
      });

      (mockedDriver.deleteExpiredEvents as jest.Mock).mockReturnValue(deletePromise);

      const cleaner = createCleaner({
        expiredEventCleanup: {
          enabled: true,
          intervalMilliseconds: 1000,
          batchSize: 100,
        },
      });

      await cleaner.onModuleInit();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      const shutdownPromise = cleaner.onModuleDestroy();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Waiting for in-flight cleanup'),
      );

      let shutdownCompleted = false;
      shutdownPromise.then(() => {
        shutdownCompleted = true;
      });

      await Promise.resolve();
      expect(shutdownCompleted).toBe(false);

      resolveDelete!(0);
      await shutdownPromise;

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('ExpiredEventCleaner shutdown complete'),
      );
    });

    it('should handle shutdown when cleanup is disabled', async () => {
      const cleaner = createCleaner({
        expiredEventCleanup: {
          enabled: false,
          intervalMilliseconds: 1000,
          batchSize: 100,
        },
      });

      await cleaner.onModuleInit();
      await cleaner.onModuleDestroy();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('ExpiredEventCleaner shutdown complete'),
      );
    });

    it('should handle shutdown gracefully before onModuleInit', async () => {
      const cleaner = createCleaner({
        expiredEventCleanup: {
          enabled: true,
          intervalMilliseconds: 1000,
          batchSize: 100,
        },
      });

      await cleaner.onModuleDestroy();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('ExpiredEventCleaner shutdown complete'),
      );
    });

    it('should stop batch deletion loop during shutdown', async () => {
      let deleteCallCount = 0;
      let resolvers: Array<(value: number) => void> = [];

      (mockedDriver.deleteExpiredEvents as jest.Mock).mockImplementation(() => {
        deleteCallCount++;
        return new Promise<number>(resolve => {
          resolvers.push(resolve);
        });
      });

      const cleaner = createCleaner({
        expiredEventCleanup: {
          enabled: true,
          intervalMilliseconds: 1000,
          batchSize: 100,
        },
      });

      await cleaner.onModuleInit();

      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(deleteCallCount).toBe(1);

      const shutdownPromise = cleaner.onModuleDestroy();

      resolvers[0](100);
      await Promise.resolve();
      await Promise.resolve();

      await shutdownPromise;

      expect(deleteCallCount).toBe(1);
    });
  });

});
