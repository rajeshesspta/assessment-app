import { describe, expect, it, vi } from 'vitest';
import { eventBus } from '../event-bus.js';

describe('eventBus', () => {
  it('invokes subscribed handlers in order', () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    eventBus.subscribe('TestEvent', handlerA);
    eventBus.subscribe('TestEvent', handlerB);

    const event = {
      id: 'evt',
      type: 'TestEvent',
      occurredAt: '2025-01-01T00:00:00.000Z',
      tenantId: 'tenant-1',
      payload: {},
    };

    eventBus.publish(event);

    expect(handlerA).toHaveBeenCalledWith(event);
    expect(handlerB).toHaveBeenCalledWith(event);
    expect(handlerA.mock.invocationCallOrder[0]).toBeLessThan(handlerB.mock.invocationCallOrder[0]);
  });

  it('swallows handler exceptions to keep publishing', () => {
    const erroring = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();

    eventBus.subscribe('ResilientEvent', erroring);
    eventBus.subscribe('ResilientEvent', good);

    eventBus.publish({
      id: 'evt2',
      type: 'ResilientEvent',
      occurredAt: '2025-01-01T00:00:00.000Z',
      tenantId: 'tenant-1',
      payload: {},
    });

    expect(good).toHaveBeenCalled();
  });
});
