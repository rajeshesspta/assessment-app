// Future utilities for tenant scoping & guards
export function assertTenantMatch(entityTenantId: string, requestTenantId: string) {
  if (entityTenantId !== requestTenantId) throw new Error('Tenant scope violation');
}
