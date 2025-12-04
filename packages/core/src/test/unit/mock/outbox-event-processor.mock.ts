import { vi } from 'vitest';

export const createMockedOutboxEventProcessor = () => {
    return {
        process: vi.fn(),
    }
}