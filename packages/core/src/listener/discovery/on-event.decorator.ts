import 'reflect-metadata';

export const ON_EVENT_METADATA_KEY = 'inbox-outbox-on-event';

export interface OnEventMetadata {
  eventName: string;
  methodName: string;
}

export function OnEvent(eventName: string): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const existingMetadata: OnEventMetadata[] = Reflect.getMetadata(ON_EVENT_METADATA_KEY, target.constructor) || [];

    existingMetadata.push({
      eventName,
      methodName: String(propertyKey),
    });

    Reflect.defineMetadata(ON_EVENT_METADATA_KEY, existingMetadata, target.constructor);

    return descriptor;
  };
}
