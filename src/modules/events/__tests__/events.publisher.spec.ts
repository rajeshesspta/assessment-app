import { beforeEach, describe, expect, it, vi } from 'vitest';

const { publishMock } = vi.hoisted(() => ({ publishMock: vi.fn() }));

vi.mock('../../../common/event-bus.js', () => ({
  eventBus: {
    publish: publishMock,
  },
}));

import { publish } from '../events.publisher.js';

describe('events.publisher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to the shared event bus', () => {
    const event = {
      id: 'event-1',
      type: 'ItemCreated',
      occurredAt: '2025-01-01T00:00:00.000Z',
      tenantId: 'tenant-1',
      payload: { itemId: 'item-1' },
    };

    publish(event);

    expect(publishMock).toHaveBeenCalledWith(event);
  });
});
