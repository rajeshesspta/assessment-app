import { describe, expect, it } from 'vitest';
import { assertTenantMatch } from '../multi-tenancy.js';

describe('assertTenantMatch', () => {
  it('returns silently when tenants align', () => {
    expect(() => assertTenantMatch('tenant-1', 'tenant-1')).not.toThrow();
  });

  it('throws when tenants differ', () => {
    expect(() => assertTenantMatch('tenant-1', 'tenant-2')).toThrowError('Tenant scope violation');
  });
});
