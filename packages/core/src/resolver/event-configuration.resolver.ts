import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { OutboxModuleEventOptions, OutboxModuleOptions, MODULE_OPTIONS_TOKEN } from "../outbox.module-definition";

@Injectable()
export class EventConfigurationResolver implements OnModuleInit {

    private readonly eventConfigurationsMap: Map<string, OutboxModuleEventOptions> = new Map();

    constructor(@Inject(MODULE_OPTIONS_TOKEN) private options: OutboxModuleOptions) {}

    onModuleInit() {
        this.options.events.forEach(event => {
            this.eventConfigurationsMap.set(event.name, event);
        });
    }

    resolve(eventName: string): OutboxModuleEventOptions {
        const config = this.eventConfigurationsMap.get(eventName);
        if (!config) {
            throw new Error(`Event configuration not found for event: ${eventName}`);
        }
        return config;
    }
}