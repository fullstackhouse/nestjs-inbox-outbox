import { IListener } from './contract/listener.interface';

export class MethodListenerAdapter<T> implements IListener<T> {
  constructor(
    private readonly instance: object,
    private readonly methodName: string,
    private readonly listenerName: string,
  ) {}

  async handle(event: T, eventName?: string): Promise<void> {
    return (this.instance as any)[this.methodName](event, eventName);
  }

  getName(): string {
    return this.listenerName;
  }
}
