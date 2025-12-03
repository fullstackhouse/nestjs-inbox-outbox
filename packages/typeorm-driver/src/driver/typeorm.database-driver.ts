import { DatabaseDriver, EventConfigurationResolverContract, InboxOutboxTransportEvent } from '@nestixis/nestjs-inbox-outbox';
import { DataSource, LessThanOrEqual, MoreThan, And } from 'typeorm';
import { TypeOrmInboxOutboxTransportEvent } from '../model/typeorm-inbox-outbox-transport-event.model';
  
export class TypeORMDatabaseDriver implements DatabaseDriver {
 
  private entitiesToPersist: any[] = [];

  private enetitiesToRemove: any[] = [];
  
  constructor(private readonly dataSource: DataSource, private readonly eventConfigurationResolver: EventConfigurationResolverContract) {}

  async findAndExtendReadyToRetryEvents(limit: number): Promise<InboxOutboxTransportEvent[]> {
    let events = [];

    await this.dataSource.transaction(async (transactionalEntityManager) => {
      const now = Date.now();

      events = await transactionalEntityManager.find(TypeOrmInboxOutboxTransportEvent, {
        where: {
          readyToRetryAfter: LessThanOrEqual(now),
          expireAt: MoreThan(now),
        },
        take: limit,
        lock: { mode: 'pessimistic_write' },
      });

      events.forEach(event => {
        const eventConfig = this.eventConfigurationResolver.resolve(event.eventName);
        event.readyToRetryAfter = now + eventConfig.listeners.readyToRetryAfterTTL;
      });

      await transactionalEntityManager.save(events);
    });

    return events;
  }

  async persist<T extends Object>(entity: T): Promise<void> {
    this.entitiesToPersist.push(entity);
  }

  async remove<T extends Object>(entity: T): Promise<void> {
    this.enetitiesToRemove.push(entity);
  }

  async flush(): Promise<void> {
    await this.dataSource.transaction(async (transactionalEntityManager) => {
      await transactionalEntityManager.save(this.entitiesToPersist);
      await transactionalEntityManager.remove(this.enetitiesToRemove);
    });

    this.entitiesToPersist = [];
    this.enetitiesToRemove = [];
  }

  createInboxOutboxTransportEvent(eventName: string, eventPayload: any, expireAt: number, readyToRetryAfter: number | null): InboxOutboxTransportEvent {
    return new TypeOrmInboxOutboxTransportEvent().create(eventName, eventPayload, expireAt, readyToRetryAfter);
  }

  async deleteExpiredEvents(limit: number): Promise<number> {
    let deletedCount = 0;

    await this.dataSource.transaction(async transactionalEntityManager => {
      const now = Date.now();
      const expiredEvents = await transactionalEntityManager.find(TypeOrmInboxOutboxTransportEvent, {
        where: {
          expireAt: LessThanOrEqual(now),
        },
        take: limit,
        lock: { mode: 'pessimistic_write' },
      });

      if (expiredEvents.length > 0) {
        await transactionalEntityManager.remove(expiredEvents);
        deletedCount = expiredEvents.length;
      }
    });

    return deletedCount;
  }
}
