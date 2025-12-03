import { EventNotificationListener } from '@nestixis/nestjs-inbox-outbox';
import { Client, Notification } from 'pg';
import { Observable, Subject } from 'rxjs';

export interface PostgreSQLConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export const POSTGRESQL_NOTIFICATION_CHANNEL = 'inbox_outbox_event';

export class PostgreSQLEventNotificationListener implements EventNotificationListener {
  private client: Client | null = null;
  private notificationsSubject = new Subject<string>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;

  constructor(
    private readonly connectionConfig: PostgreSQLConnectionConfig,
    private readonly reconnectDelayMs = 5000,
  ) {}

  get notifications$(): Observable<string> {
    return this.notificationsSubject.asObservable();
  }

  async connect(): Promise<void> {
    if (this.client || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      this.client = new Client({
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        user: this.connectionConfig.user,
        password: this.connectionConfig.password,
        database: this.connectionConfig.database,
      });

      this.client.on('notification', (msg: Notification) => {
        if (msg.channel === POSTGRESQL_NOTIFICATION_CHANNEL) {
          this.notificationsSubject.next(msg.payload ?? '');
        }
      });

      this.client.on('error', (err: Error) => {
        console.error('PostgreSQL notification listener error:', err);
        this.scheduleReconnect();
      });

      this.client.on('end', () => {
        this.client = null;
        this.scheduleReconnect();
      });

      await this.client.connect();
      await this.client.query(`LISTEN ${POSTGRESQL_NOTIFICATION_CHANNEL}`);
    } catch (error) {
      this.client = null;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.client) {
      try {
        await this.client.query(`UNLISTEN ${POSTGRESQL_NOTIFICATION_CHANNEL}`);
        await this.client.end();
      } catch {
        // Ignore errors during disconnect
      }
      this.client = null;
    }

    this.notificationsSubject.complete();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout || this.isConnecting) {
      return;
    }

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      try {
        await this.connect();
      } catch (error) {
        console.error('PostgreSQL notification listener reconnect failed:', error);
        this.scheduleReconnect();
      }
    }, this.reconnectDelayMs);
  }
}
