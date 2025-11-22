import { DomainEvent } from './types.js';

type Handler = (event: DomainEvent) => void;

class InMemoryEventBus {
  private handlers: Map<string, Handler[]> = new Map();

  publish(event: DomainEvent) {
    const list = this.handlers.get(event.type) || [];
    for (const h of list) {
      try { h(event); } catch (err) { /* swallow for MVP */ }
    }
  }

  subscribe(eventType: string, handler: Handler) {
    const list = this.handlers.get(eventType) || [];
    list.push(handler);
    this.handlers.set(eventType, list);
  }
}

export const eventBus = new InMemoryEventBus();
