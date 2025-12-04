export abstract class OutboxEvent {
  /**
   * @description Should be unique name of the event
   */
  public abstract readonly name: string;
}
