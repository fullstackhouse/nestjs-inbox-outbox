import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client } from 'pg';
import { firstValueFrom, take, toArray, timeout } from 'rxjs';
import {
  PostgreSQLEventNotificationListener,
  POSTGRESQL_NOTIFICATION_CHANNEL,
} from '../listener/postgresql-event-notification.listener';
import { BASE_CONNECTION, createTestDatabase, dropTestDatabase } from './test-utils';

describe('PostgreSQLEventNotificationListener', () => {
  let listener: PostgreSQLEventNotificationListener;
  let dbName: string;
  let notifyClient: Client;

  beforeEach(async () => {
    dbName = await createTestDatabase();

    listener = new PostgreSQLEventNotificationListener({
      ...BASE_CONNECTION,
      database: dbName,
    });

    notifyClient = new Client({
      ...BASE_CONNECTION,
      database: dbName,
    });
    await notifyClient.connect();
  });

  afterEach(async () => {
    await listener.disconnect();
    await notifyClient.end();
    await dropTestDatabase(dbName);
  });

  it('should connect and listen for notifications', async () => {
    await listener.connect();

    const notificationPromise = firstValueFrom(
      listener.notifications$.pipe(take(1), timeout(5000)),
    );

    await notifyClient.query(`NOTIFY ${POSTGRESQL_NOTIFICATION_CHANNEL}, '123'`);

    const payload = await notificationPromise;
    expect(payload).toBe('123');
  });

  it('should receive multiple notifications', async () => {
    await listener.connect();

    const notificationsPromise = firstValueFrom(
      listener.notifications$.pipe(take(3), toArray(), timeout(5000)),
    );

    await notifyClient.query(`NOTIFY ${POSTGRESQL_NOTIFICATION_CHANNEL}, '1'`);
    await notifyClient.query(`NOTIFY ${POSTGRESQL_NOTIFICATION_CHANNEL}, '2'`);
    await notifyClient.query(`NOTIFY ${POSTGRESQL_NOTIFICATION_CHANNEL}, '3'`);

    const payloads = await notificationsPromise;
    expect(payloads).toEqual(['1', '2', '3']);
  });

  it('should ignore notifications on other channels', async () => {
    await listener.connect();

    let receivedNotification = false;
    const subscription = listener.notifications$.subscribe(() => {
      receivedNotification = true;
    });

    await notifyClient.query(`NOTIFY other_channel, 'ignored'`);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(receivedNotification).toBe(false);
    subscription.unsubscribe();
  });

  it('should handle connect being called multiple times', async () => {
    await listener.connect();
    await listener.connect();

    const notificationPromise = firstValueFrom(
      listener.notifications$.pipe(take(1), timeout(5000)),
    );

    await notifyClient.query(`NOTIFY ${POSTGRESQL_NOTIFICATION_CHANNEL}, 'test'`);

    const payload = await notificationPromise;
    expect(payload).toBe('test');
  });

  it('should handle disconnect gracefully', async () => {
    await listener.connect();

    const notificationPromise = firstValueFrom(
      listener.notifications$.pipe(take(1), timeout(5000)),
    );

    await notifyClient.query(`NOTIFY ${POSTGRESQL_NOTIFICATION_CHANNEL}, 'before-disconnect'`);

    const payload = await notificationPromise;
    expect(payload).toBe('before-disconnect');

    await listener.disconnect();
  });

  it('should handle notifications with empty payload', async () => {
    await listener.connect();

    const notificationPromise = firstValueFrom(
      listener.notifications$.pipe(take(1), timeout(5000)),
    );

    await notifyClient.query(`NOTIFY ${POSTGRESQL_NOTIFICATION_CHANNEL}`);

    const payload = await notificationPromise;
    expect(payload).toBe('');
  });
});

describe('PostgreSQLEventNotificationListener reconnection', () => {
  let dbName: string;

  beforeEach(async () => {
    dbName = await createTestDatabase();
  });

  afterEach(async () => {
    await dropTestDatabase(dbName);
  });

  it('should attempt to reconnect on connection error', async () => {
    const listener = new PostgreSQLEventNotificationListener(
      {
        ...BASE_CONNECTION,
        database: dbName,
      },
      100,
    );

    const connectSpy = vi.spyOn(listener, 'connect');

    await listener.connect();
    expect(connectSpy).toHaveBeenCalledTimes(1);

    await listener.disconnect();
  });
});
