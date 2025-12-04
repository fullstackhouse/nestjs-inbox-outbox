import { DatabaseDriver, EventConfigurationResolverContract, EventListener } from '@fullstackhouse/nestjs-outbox';
import { DataSource } from 'typeorm';
import { TypeORMDatabaseDriver } from './typeorm.database-driver';

export class TypeORMDatabaseDriverFactory {
  constructor(private readonly dataSource: DataSource) {}

  create(eventConfigurationResolver: EventConfigurationResolverContract): DatabaseDriver {
    return new TypeORMDatabaseDriver(this.dataSource, eventConfigurationResolver);
  }

  getEventListener(): EventListener | null {
    return null;
  }
}
