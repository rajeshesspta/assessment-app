# Consumer BFF roadmap

Planned changes to support the new multi-tenant runtime:

1. **Config bundle loading**

   - Load a JSON (or env-provided) structure that matches `src/tenant-config.ts` on startup.
   - Keep the parsed bundle in memory, watching for optional hot-reload hooks later.

2. **Tenant resolution middleware**

   - Derive tenant per request using the `Host` header via `resolveTenantByHost`.
   - Attach `{ tenant, matchedHost }` to `request` for downstream handlers.
   - Reject unknown hosts with a 404-style error so we do not leak other tenants.

3. **Auth/OAuth wiring**

   - Pick Google client/secret/redirect URI from the resolved tenant (fallback for premium single-host deployments).
   - Issue session cookies scoped to the tenant (include `tenantId` in the JWT payload for downstream use).

4. **Headless API proxying**

   - Update `callHeadless` to accept tenant context and send the tenant-specific `baseUrl`, `apiKey`, `tenantId`, and role list.
   - Allow actor role overrides only within a tenant’s allowed set (protect against cross-tenant spoofing).

5. **/config endpoint**

   - Add a lightweight endpoint that returns branding tokens, feature flags, support email, and landing routes for the requesting tenant.
   - Portal will fetch this during boot to theme itself.

6. **Premium deployment escape hatch**

   - When `NODE_ENV` or an env flag indicates a single-tenant (premium) stack, allow bypassing host-based resolution by forcing a known `tenantId` from config.

7. **Monitoring hooks**
   - Tag Fastify logs with `tenantId` and `matchedHost` to help isolate issues.
   - Emit warnings when config is missing optional but recommended fields (support email, branding) so ops can fix the registry.
