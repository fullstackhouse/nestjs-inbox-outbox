import { DatabaseDriverFactory } from '../../driver/database-driver.factory';
import { DatabaseDriver } from '../../driver/database.driver';
import { TransactionalEventEmitter, TransactionalEventEmitterOperations } from '../../emitter/transactional-event-emitter';
import { OutboxModuleOptions } from '../../outbox.module-definition';
import { IListener } from '../../listener/contract/listener.interface';
import { OutboxEventProcessorContract } from '../../processor/outbox-event-processor.contract';
import { EventConfigurationResolverContract } from '../../resolver/event-configuration-resolver.contract';
import { createMockedDriverFactory } from './mock/driver-factory.mock';
import { createMockedDriver } from './mock/driver.mock';
import { createMockedEventConfigurationResolver } from './mock/event-configuration-resolver.mock';
import { createMockedOutboxEventProcessor } from './mock/outbox-event-processor.mock';
import { createMockedOutboxOptionsFactory } from './mock/outbox-options.mock';

describe('TransacationalEventEmitter', () => {

  let mockedDriver: DatabaseDriver;
  let mockedDriverFactory: DatabaseDriverFactory;
  let outboxOptions: OutboxModuleOptions;
  let mockedOutboxEventProcessor: OutboxEventProcessorContract;
  let mockedEventConfigurationResolver: EventConfigurationResolverContract;

  beforeEach(() => {
    mockedDriver = createMockedDriver();
    mockedDriverFactory = createMockedDriverFactory(mockedDriver);
    outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, []);
    mockedOutboxEventProcessor = createMockedOutboxEventProcessor();
    mockedEventConfigurationResolver = createMockedEventConfigurationResolver();
  });

  it('Should call persist 2 times and flush', async () => {

    outboxOptions.events = [
      {
        name: 'newEvent',
        listeners: {
          expiresAtTTL: 1000,
          readyToRetryAfterTTL: 1000,
          maxExecutionTimeTTL: 1000,
        },
      },
    ];

    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const newEvent = {
      name: 'newEvent',
    };

    const newEntityToSave = {
      id: null,
    };

    await transactionalEventEmitter.emit(newEvent, [
      {
        entity: newEntityToSave,
        operation: TransactionalEventEmitterOperations.persist,
      },
    ]);

    expect(mockedDriver.persist).toHaveBeenCalledWith(newEntityToSave);
    expect(mockedDriver.persist).toHaveBeenCalledTimes(2);
    expect(mockedDriver.flush).toHaveBeenCalled();
  });

  it('Should call remove 1 times and flush', async () => {

    outboxOptions.events = [
      {
        name: 'newEvent',
        listeners: {
          expiresAtTTL: 1000,
          readyToRetryAfterTTL: 1000,
          maxExecutionTimeTTL: 1000,
        },
      },
    ];

    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const newEvent = {
      name: 'newEvent',
    };

    const newEntityToRemove = {
      id: null,
    };

    await transactionalEventEmitter.emit(newEvent, [
      {
        entity: newEntityToRemove,
        operation: TransactionalEventEmitterOperations.remove,
      },
    ]);

    expect(mockedDriver.remove).toHaveBeenCalledWith(newEntityToRemove);
    expect(mockedDriver.remove).toHaveBeenCalledTimes(1);
    expect(mockedDriver.flush).toHaveBeenCalled();
  });

  it('Should call persist 3 times and flush', async () => {

    outboxOptions.events = [
      {
        name: 'newEvent',
        listeners: {
          expiresAtTTL: 1000,
          readyToRetryAfterTTL: 1000,
          maxExecutionTimeTTL: 1000,
        },
      },
    ];

    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const newEvent = {
      name: 'newEvent',
    };

    const newEntityToSave = {
      id: null,
    };

    await transactionalEventEmitter.emit(newEvent, [
      {
        entity: newEntityToSave,
        operation: TransactionalEventEmitterOperations.persist,
      },
      {
        entity: newEntityToSave,
        operation: TransactionalEventEmitterOperations.persist,
      },
    ]);

    expect(mockedDriver.persist).toHaveBeenCalledTimes(3);
    expect(mockedDriver.flush).toHaveBeenCalled();
  });

  it('Should call persist 1 times and flush', async () => {

    outboxOptions.events = [
      {
        name: 'newEvent',
        listeners: {
          expiresAtTTL: 1000,
          readyToRetryAfterTTL: 1000,
          maxExecutionTimeTTL: 1000,
        },
      },
    ];

    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const newEvent = {
      name: 'newEvent',
    };
    
    await transactionalEventEmitter.emit(newEvent);

    expect(mockedDriver.persist).toHaveBeenCalledTimes(1);
    expect(mockedDriver.flush).toHaveBeenCalled();
  });

  it('Should call process one time on outboxEventProcessor', async () => {

    outboxOptions.events = [
      {
        name: 'newEvent',
        listeners: {
          expiresAtTTL: 1000,
          readyToRetryAfterTTL: 1000,
          maxExecutionTimeTTL: 1000,
        },
      },
    ];
  
    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    outboxOptions = createMockedOutboxOptionsFactory(mockedDriverFactory, [
      {
        name: 'newEvent',
        listeners: {
          expiresAtTTL: 1000,
          readyToRetryAfterTTL: 1000,
          maxExecutionTimeTTL: 1000,
        },
      },
    ]);

    const newEvent = {
      name: 'newEvent',
    };

    const newEntityToSave = {
      id: null,
    };

    await transactionalEventEmitter.emit(newEvent, [
      {
        entity: newEntityToSave,
        operation: TransactionalEventEmitterOperations.persist,
      },
    ]);

    expect(mockedOutboxEventProcessor.process).toHaveBeenCalledTimes(1);
  });

  it('Should throw an error when event is not configured', async () => {
    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const newEvent = {
      name: 'notConfiguredEvent',
    };

    await expect(transactionalEventEmitter.emit(newEvent)).rejects.toThrow(`Event ${newEvent.name} is not configured. Did you forget to add it to the module options?`);
  })


  it('Should throw an error when listener has duplicate name', async () => {
    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const listener : IListener<any> = {
      getName: () => {
        return 'listenerName';
      },
      handle: async () => {
        return;
      }
    };

    transactionalEventEmitter.addListener('eventName', listener);

    expect(() => transactionalEventEmitter.addListener('eventName', listener)).toThrow(`Listener ${listener.getName()} is already registered`);
  });

  it('Should add listener', async () => {
    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const listener : IListener<any> = {
      getName: () => {
        return 'listenerName';
      },
      handle: async () => {
        return;
      }
    };

    transactionalEventEmitter.addListener('eventName', listener);

    expect(transactionalEventEmitter.getListeners('eventName')).toContain(listener);
  });
  

  it('Should remove listener', async () => {
    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const listener : IListener<any> = {
      getName: () => {
        return 'listenerName';
      },
      handle: async () => {
        return;
      }
    };

    transactionalEventEmitter.addListener('eventName', listener);

    transactionalEventEmitter.removeListeners('eventName');

    expect(transactionalEventEmitter.getListeners('eventName')).toEqual([]);
  })

  it('Should get event names', async () => {
    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const listener : IListener<any> = {
      getName: () => {
        return 'listenerName';
      },
      handle: async () => {
        return;
      }
    };

    transactionalEventEmitter.addListener('eventName', listener);

    expect(transactionalEventEmitter.getEventNames()).toContain('eventName');
  })

  it('Should not call process when immediateProcessing is false', async () => {
    outboxOptions.events = [
      {
        name: 'newEvent',
        listeners: {
          expiresAtTTL: 1000,
          readyToRetryAfterTTL: 1000,
          maxExecutionTimeTTL: 1000,
        },
        immediateProcessing: false,
      },
    ];

    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const newEvent = {
      name: 'newEvent',
    };

    await transactionalEventEmitter.emit(newEvent);

    expect(mockedDriver.persist).toHaveBeenCalledTimes(1);
    expect(mockedDriver.flush).toHaveBeenCalled();
    expect(mockedOutboxEventProcessor.process).not.toHaveBeenCalled();
  });

  it('Should not call process when immediateProcessing is false with emitAsync', async () => {
    outboxOptions.events = [
      {
        name: 'newEvent',
        listeners: {
          expiresAtTTL: 1000,
          readyToRetryAfterTTL: 1000,
          maxExecutionTimeTTL: 1000,
        },
        immediateProcessing: false,
      },
    ];

    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const newEvent = {
      name: 'newEvent',
    };

    await transactionalEventEmitter.emitAsync(newEvent);

    expect(mockedDriver.persist).toHaveBeenCalledTimes(1);
    expect(mockedDriver.flush).toHaveBeenCalled();
    expect(mockedOutboxEventProcessor.process).not.toHaveBeenCalled();
  });

  it('Should call process when immediateProcessing is true', async () => {
    outboxOptions.events = [
      {
        name: 'newEvent',
        listeners: {
          expiresAtTTL: 1000,
          readyToRetryAfterTTL: 1000,
          maxExecutionTimeTTL: 1000,
        },
        immediateProcessing: true,
      },
    ];

    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const newEvent = {
      name: 'newEvent',
    };

    await transactionalEventEmitter.emit(newEvent);

    expect(mockedOutboxEventProcessor.process).toHaveBeenCalledTimes(1);
  });

  it('Should call process when immediateProcessing is undefined (default behavior)', async () => {
    outboxOptions.events = [
      {
        name: 'newEvent',
        listeners: {
          expiresAtTTL: 1000,
          readyToRetryAfterTTL: 1000,
          maxExecutionTimeTTL: 1000,
        },
      },
    ];

    const transactionalEventEmitter = new TransactionalEventEmitter(outboxOptions, mockedDriverFactory, mockedOutboxEventProcessor, mockedEventConfigurationResolver);

    const newEvent = {
      name: 'newEvent',
    };

    await transactionalEventEmitter.emit(newEvent);

    expect(mockedOutboxEventProcessor.process).toHaveBeenCalledTimes(1);
  });
});
