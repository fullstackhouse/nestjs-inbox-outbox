import { vi } from 'vitest';

export const createMockedDriver = () => {
    return {
        persist: vi.fn(),
        remove: vi.fn(),
        flush: vi.fn(),
        createOutboxTransportEvent: vi.fn(),
        findAndExtendReadyToRetryEvents: vi.fn()
    }
}