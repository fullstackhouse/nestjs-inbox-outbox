import { Injectable, Logger } from '@nestjs/common';
import { OutboxEventContext, OutboxListenerResult, OutboxMiddleware } from './outbox-middleware.interface';

@Injectable()
export class LoggerMiddleware implements OutboxMiddleware {
  private readonly logger = new Logger('Outbox');

  beforeProcess(context: OutboxEventContext): void {
    this.logger.log(`OUTBOX START ${context.eventName}`, {
      eventId: context.eventId,
      listener: context.listenerName,
      payload: context.eventPayload,
    });
  }

  afterProcess(context: OutboxEventContext, result: OutboxListenerResult): void {
    const logContext = {
      eventId: context.eventId,
      listener: context.listenerName,
      payload: context.eventPayload,
      processTime: result.durationMs,
    };

    if (result.success) {
      this.logger.log(`OUTBOX END   ${context.eventName}`, logContext);
    } else {
      this.logger.error(`OUTBOX FAIL  ${context.eventName}`, {
        ...logContext,
        error: result.error?.message ?? 'Unknown error',
      });
    }
  }
}
