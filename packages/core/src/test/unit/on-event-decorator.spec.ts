import { describe, it, expect } from 'vitest';
import { OnEvent, ON_EVENT_METADATA_KEY, OnEventMetadata } from '../../listener/discovery/on-event.decorator';
import { MethodListenerAdapter } from '../../listener/method-listener-adapter';

describe('OnEvent decorator', () => {
  it('should attach metadata to class constructor', () => {
    class TestListener {
      @OnEvent('TestEvent')
      handleTestEvent() {}
    }

    const metadata: OnEventMetadata[] = Reflect.getMetadata(ON_EVENT_METADATA_KEY, TestListener);

    expect(metadata).toBeDefined();
    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toEqual({
      eventName: 'TestEvent',
      methodName: 'handleTestEvent',
    });
  });

  it('should support multiple OnEvent decorators on different methods', () => {
    class TestListener {
      @OnEvent('FirstEvent')
      handleFirstEvent() {}

      @OnEvent('SecondEvent')
      handleSecondEvent() {}

      @OnEvent('ThirdEvent')
      handleThirdEvent() {}
    }

    const metadata: OnEventMetadata[] = Reflect.getMetadata(ON_EVENT_METADATA_KEY, TestListener);

    expect(metadata).toBeDefined();
    expect(metadata).toHaveLength(3);
    expect(metadata).toContainEqual({ eventName: 'FirstEvent', methodName: 'handleFirstEvent' });
    expect(metadata).toContainEqual({ eventName: 'SecondEvent', methodName: 'handleSecondEvent' });
    expect(metadata).toContainEqual({ eventName: 'ThirdEvent', methodName: 'handleThirdEvent' });
  });

  it('should not interfere with class without decorator', () => {
    class NoDecoratorClass {
      someMethod() {}
    }

    const metadata = Reflect.getMetadata(ON_EVENT_METADATA_KEY, NoDecoratorClass);
    expect(metadata).toBeUndefined();
  });
});

describe('MethodListenerAdapter', () => {
  it('should call the correct method on the instance', async () => {
    const handledEvents: any[] = [];

    const instance = {
      handleTestEvent: async (event: any) => {
        handledEvents.push(event);
      },
    };

    const adapter = new MethodListenerAdapter(instance, 'handleTestEvent', 'TestListener.handleTestEvent');

    await adapter.handle({ id: 1, name: 'test' });

    expect(handledEvents).toHaveLength(1);
    expect(handledEvents[0]).toEqual({ id: 1, name: 'test' });
  });

  it('should return the correct listener name', () => {
    const instance = {
      handleEvent: async () => {},
    };

    const adapter = new MethodListenerAdapter(instance, 'handleEvent', 'MyListener.handleEvent');

    expect(adapter.getName()).toBe('MyListener.handleEvent');
  });

  it('should pass eventName as second parameter to method', async () => {
    let receivedEventName: string | undefined;

    const instance = {
      handleTestEvent: async (_event: any, eventName?: string) => {
        receivedEventName = eventName;
      },
    };

    const adapter = new MethodListenerAdapter(instance, 'handleTestEvent', 'TestListener.handleTestEvent');

    await adapter.handle({ id: 1 }, 'SomeEventName');

    expect(receivedEventName).toBe('SomeEventName');
  });

  it('should propagate errors from the method', async () => {
    const instance = {
      handleTestEvent: async () => {
        throw new Error('Handler failed');
      },
    };

    const adapter = new MethodListenerAdapter(instance, 'handleTestEvent', 'TestListener.handleTestEvent');

    await expect(adapter.handle({ id: 1 })).rejects.toThrow('Handler failed');
  });
});
