import { DatabaseDriverFactory } from "../../../driver/database-driver.factory";

export const createMockedOutboxOptionsFactory = (mockedDriverFactory: DatabaseDriverFactory, events: {
    name: string,
    listeners: {
        expiresAtTTL: number,
        readyToRetryAfterTTL: number,
        maxExecutionTimeTTL: number
    }
}[]) => ({
    driverFactory: mockedDriverFactory,
    retryEveryMilliseconds: 1000,
    maxOutboxTransportEventPerRetry: 1000,
    events
});
