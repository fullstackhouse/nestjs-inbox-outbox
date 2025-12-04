import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { TransactionalEventEmitter } from '../../emitter/transactional-event-emitter';
import { MethodListenerAdapter } from '../method-listener-adapter';
import { ListenerDuplicateNameException } from '../exception/listener-duplicate-name.exception';
import { ON_EVENT_METADATA_KEY, OnEventMetadata } from './on-event.decorator';

@Injectable()
export class ListenerDiscovery implements OnModuleInit {
  constructor(
    private readonly transactionalEventEmitter: TransactionalEventEmitter,
    @Inject(DiscoveryService) private discoveryService: DiscoveryService,
    @Inject(Logger) private logger: Logger,
  ) {}

  onModuleInit() {
    const listenerProvidersWrappers = this.discoveryService.getProviders();
    const listenerUniqueNames = new Set<string>();

    this.discoverMethodLevelListeners(listenerProvidersWrappers, listenerUniqueNames);
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
          `Method listener ${listenerName} has been registered for outbox event ${metadata.eventName}`,
        );
      }
    }
  }
}
