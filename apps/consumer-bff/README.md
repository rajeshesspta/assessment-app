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

## Control plane integration

- Set `CONTROL_PLANE_BASE_URL` and `CONTROL_PLANE_API_KEY` to have the BFF fetch `control/tenant-bundle` directly from the control plane API.
- Optional `CONTROL_PLANE_BUNDLE_PATH` overrides the relative endpoint, and `TENANT_CONFIG_REFRESH_MS` configures how often the in-memory bundle is refreshed.
- When control plane sync is disabled the BFF falls back to `TENANT_CONFIG_PATH`/`TENANT_CONFIG_JSON` just like before.

## BFF Data Handling and Storage

The BFF (Backend-for-Frontend) does not persist business or tenant data. Instead, it handles and stores only transient/session-related data needed for frontend interactions:

### What the BFF Stores/Handles
- **User session data:** Auth tokens, userId, tenantId, roles, session expiry, etc. (in memory, cookies, or session store)
- **Request context:** Current tenant, actor roles, API keys (for proxying to headless)
- **Temporary cache:** Short-lived config, branding, or feature flags fetched from the headless API or control plane (for performance)
- **Frontend state:** UI preferences, last visited page, etc. (if needed for user experience, but usually in browser)
- **Error and audit logs:** For debugging, monitoring, and security (not business data)

### What the BFF Does NOT Store
- Tenants, taxonomy, items, assessments, users, attempts, or any domain/business data.  
- All persistent data is managed by the headless API and its database.

### Summary
The BFF is a stateless adapter and proxy, not a source of truth. Its storage is limited to session, cache, and request context for frontend delivery and security.

---

## BFF Role in Tenant Management

- **API Gateway:** Forwards tenant management requests (create, update, list, etc.) from the frontend to the headless control plane API.
- **Session & Auth Handling:** Manages user sessions, injects tenant context, and enforces role-based access before forwarding requests.
- **Response Shaping:** Adapts, filters, or combines data from the headless API to match frontend needs (e.g., hiding sensitive fields, merging configs).
- **Multi-tenant Routing:** Ensures requests are scoped to the correct tenant, using headers or session data.
- **Branding & Feature Flags:** Delivers per-tenant branding, feature toggles, and runtime config to the frontend, sourced from the control plane.
- **Performance & Security:** Caches, rate-limits, and secures requests to the headless API.

**Note:** The BFF does not persist tenant data or enforce business rules. All authoritative tenant management (CRUD, config, keys, etc.) is handled by the headless control plane API. The BFF’s job is to make the frontend experience seamless, secure, and tenant-aware.

---
