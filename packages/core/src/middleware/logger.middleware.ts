import { Injectable, Logger } from '@nestjs/common';
import { OutboxEventContext, OutboxListenerResult, OutboxMiddleware } from './outbox-middleware.interface';

@Injectable()
export class LoggerMiddleware implements OutboxMiddleware {
  private readonly logger = new Logger('OutboxMiddleware');

  beforeProcess(context: OutboxEventContext): void {
    this.logger.log(`Processing ${context.eventName} (id=${context.eventId}) → ${context.listenerName}`);
  }

  afterProcess(context: OutboxEventContext, result: OutboxListenerResult): void {
    if (result.success) {
      this.logger.log(`Completed ${context.eventName} (id=${context.eventId}) → ${context.listenerName} in ${result.durationMs}ms`);
    }
  }

  onError(context: OutboxEventContext, error: Error): void {
    this.logger.error(
      `Failed ${context.eventName} (id=${context.eventId}) → ${context.listenerName}: ${error.message}`,
    );
  }
}
