import { z } from 'zod';

const actorHeaderSchema = z.object({
  actor: z.string().min(1).optional(),
  roles: z.string().optional(),
});

function coerceHeaderValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === 'string' ? value : undefined;
}

export interface ActorContext {
  actor: string;
  roles: string[];
}

export function parseActorContext(headers: Record<string, unknown>): ActorContext {
  const parsed = actorHeaderSchema.safeParse({
    actor: coerceHeaderValue(headers['x-control-plane-actor'] ?? headers['X-Control-Plane-Actor']),
    roles: coerceHeaderValue(headers['x-control-plane-roles'] ?? headers['X-Control-Plane-Roles']),
  });

  const actor = parsed.success && parsed.data.actor ? parsed.data.actor : 'system';
  const roles: string[] = [];
  if (parsed.success && parsed.data.roles) {
    parsed.data.roles
      .split(',')
      .map(role => role.trim().toUpperCase())
      .filter(role => role.length > 0)
      .forEach(role => roles.push(role));
  }
  return { actor, roles };
}

export function isSuperAdmin(context: ActorContext): boolean {
  return context.roles.includes('SUPER_ADMIN');
}
