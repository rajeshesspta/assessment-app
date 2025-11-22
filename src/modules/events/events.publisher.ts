// Placeholder for future outbox / external broker integration
import { eventBus } from '../../common/event-bus.js';
export const publish = eventBus.publish.bind(eventBus);
