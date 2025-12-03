import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription, catchError, concatMap, EMPTY, from, interval, repeat } from 'rxjs';
import { DATABASE_DRIVER_FACTORY_TOKEN, DatabaseDriverFactory } from '../driver/database-driver.factory';
import { InboxOutboxModuleOptions, MODULE_OPTIONS_TOKEN } from '../inbox-outbox.module-definition';
import { EventConfigurationResolver } from '../resolver/event-configuration.resolver';

@Injectable()
export class ExpiredEventCleaner implements OnModuleInit, OnModuleDestroy {
  private subscription: Subscription | null = null;
  private inFlightCleanup: Promise<unknown> | null = null;
  private isShuttingDown = false;

  constructor(
    @Inject(MODULE_OPTIONS_TOKEN) private options: InboxOutboxModuleOptions,
    @Inject(DATABASE_DRIVER_FACTORY_TOKEN) private databaseDriverFactory: DatabaseDriverFactory,
    private eventConfigurationResolver: EventConfigurationResolver,
    @Inject(Logger) private logger: Logger,
  ) {}

  async onModuleInit() {
    const cleanupOptions = this.options.expiredEventCleanup;

    if (!cleanupOptions?.enabled) {
      return;
    }

    this.logger.log(
      `ExpiredEventCleaner started: intervalMilliseconds: ${cleanupOptions.intervalMilliseconds}, batchSize: ${cleanupOptions.batchSize}`,
    );

    this.subscription = interval(cleanupOptions.intervalMilliseconds)
      .pipe(
        concatMap(() => {
          if (this.isShuttingDown) {
            return EMPTY;
          }
          return from(this.cleanupExpiredEvents());
        }),
        catchError(exception => {
          this.logger.error(`ExpiredEventCleaner error: ${exception}`);
          return EMPTY;
        }),
        repeat(),
      )
      .subscribe();
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;

    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }

    if (this.inFlightCleanup) {
      this.logger.log('Waiting for in-flight cleanup to complete...');
      await this.inFlightCleanup;
    }

    this.logger.log('ExpiredEventCleaner shutdown complete.');
  }

  private async cleanupExpiredEvents(): Promise<void> {
    const cleanupPromise = this.doCleanup();
    this.inFlightCleanup = cleanupPromise;

    try {
      await cleanupPromise;
    } finally {
      this.inFlightCleanup = null;
    }
  }

  private async doCleanup(): Promise<void> {
    const batchSize = this.options.expiredEventCleanup?.batchSize ?? 100;
    const databaseDriver = this.databaseDriverFactory.create(this.eventConfigurationResolver);

    let totalDeleted = 0;
    let deletedInBatch: number;

    do {
      deletedInBatch = await databaseDriver.deleteExpiredEvents(batchSize);
      totalDeleted += deletedInBatch;
    } while (deletedInBatch === batchSize && !this.isShuttingDown);

    if (totalDeleted > 0) {
      this.logger.log(`ExpiredEventCleaner: deleted ${totalDeleted} expired event(s)`);
    }
  }
}
