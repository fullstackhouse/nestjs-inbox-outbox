import { Observable } from 'rxjs';

export const EVENT_NOTIFICATION_LISTENER_TOKEN = 'EVENT_NOTIFICATION_LISTENER_TOKEN';

export interface EventNotificationListener {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  notifications$: Observable<string>;
}
