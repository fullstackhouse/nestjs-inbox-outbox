import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { TransactionalEventEmitter } from '../../emitter/transactional-event-emitter';
import { IListener } from '../contract/listener.interface';
import { MethodListenerAdapter } from '../method-listener-adapter';
import { ListenerDuplicateNameException } from '../exception/listener-duplicate-name.exception';
import { ON_EVENT_METADATA_KEY, OnEventMetadata } from './on-event.decorator';
import { REGISTRY_METADATA_KEY } from './listener.registry';

@Injectable()
export class ListenerDiscovery implements OnModuleInit {
  constructor(
    private readonly transactionalEventEmitter: TransactionalEventEmitter,
    @Inject(DiscoveryService) private discoveryService: DiscoveryService,
    @Inject(Logger) private logger: Logger,
  ) {}

  isListener(target: any): target is IListener<any> {
    return target && typeof target.handle === 'function';
  }

  onModuleInit() {
    const listenerProvidersWrappers = this.discoveryService.getProviders();
    const listenerUniqueNames = new Set<string>();

    this.discoverClassLevelListeners(listenerProvidersWrappers, listenerUniqueNames);
    this.discoverMethodLevelListeners(listenerProvidersWrappers, listenerUniqueNames);
  }

  private discoverClassLevelListeners(
    listenerProvidersWrappers: ReturnType<DiscoveryService['getProviders']>,
    listenerUniqueNames: Set<string>,
  ): void {
    const listeners = listenerProvidersWrappers.filter(
      (provider) => provider.metatype && Reflect.getMetadata(REGISTRY_METADATA_KEY, provider.metatype),
    );

    for (const listener of listeners) {
      if (!this.isListener(listener.instance)) {
        continue;
      }

      const listenerName = listener.instance.getName();

      if (listenerUniqueNames.has(listenerName)) {
        throw new ListenerDuplicateNameException(listenerName);
      }

      listenerUniqueNames.add(listenerName);

      const eventsNames = Reflect.getMetadata(REGISTRY_METADATA_KEY, listener.metatype);

      if (Array.isArray(eventsNames)) {
        eventsNames.forEach((eventName) => {
          this.transactionalEventEmitter.addListener(eventName, listener.instance);
          this.logger.log(`Listener ${listener.metatype.name} has been registered for inbox outbox event ${eventName}`);
        });
      }

      if (!Array.isArray(eventsNames)) {
        this.transactionalEventEmitter.addListener(eventsNames, listener.instance);
        this.logger.log(`Listener ${listener.metatype.name} has been registered for inbox outbox event ${eventsNames}`);
      }
    }
  }

  private discoverMethodLevelListeners(
    listenerProvidersWrappers: ReturnType<DiscoveryService['getProviders']>,
    listenerUniqueNames: Set<string>,
  ): void {
    const providersWithOnEvent = listenerProvidersWrappers.filter(
      (provider) => provider.metatype && Reflect.getMetadata(ON_EVENT_METADATA_KEY, provider.metatype),
    );

    for (const provider of providersWithOnEvent) {
      const onEventMetadataList: OnEventMetadata[] = Reflect.getMetadata(ON_EVENT_METADATA_KEY, provider.metatype) || [];

      for (const metadata of onEventMetadataList) {
        const listenerName = `${provider.metatype.name}.${metadata.methodName}`;

        if (listenerUniqueNames.has(listenerName)) {
          throw new ListenerDuplicateNameException(listenerName);
        }

        listenerUniqueNames.add(listenerName);

        const adapter = new MethodListenerAdapter(provider.instance, metadata.methodName, listenerName);

        this.transactionalEventEmitter.addListener(metadata.eventName, adapter);
        this.logger.log(
          `Method listener ${listenerName} has been registered for inbox outbox event ${metadata.eventName}`,
        );
      }
    }
  }
}
