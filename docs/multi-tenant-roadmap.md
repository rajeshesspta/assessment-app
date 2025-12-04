# Multi-tenant BFF + Portal Roadmap

Reference plan that guides the shared vs premium deployment workstreams for the Consumer BFF and Portal.

## Goals

- Serve many tenants from a shared stack without leaking data, secrets, or branding.
- Keep premium (single-tenant) deployments aligned with the shared stack while allowing isolated overrides.
- Provide a consistent developer experience so routing, auth, and theming work the same locally and in prod.

## Phase 1 – Baseline runtime (current sprint)

1. **Tenant config bundle**
   - Define schema (`src/tenant-config.ts`) with tenant ids, hostnames, headless API credentials, Google OAuth info, branding tokens, support email, and feature flags.
   - Load bundle at BFF startup, validate, and cache. Allow JSON file or env payloads.
2. **Tenant-aware request flow**
   - Resolve tenant per HTTP request via `Host` header (with premium escape hatch).
   - Inject `tenantId`, API key, actor roles, and headless base URL into proxy calls.
   - Issue session cookies containing `{ tenantId, user }` and keep redirect URIs/landing paths per tenant.
3. **Config endpoint + portal bootstrap**
   - BFF exposes `/config` with branding tokens, support email, landing paths, feature flags, and tenant display name.
   - Portal fetches `/config` before rendering, applies CSS variables/logos/favicons, and caches `tenantId`.
4. **Logging + observability**
   - Tag Fastify logs and metrics with `tenantId` + host; surface warnings when optional metadata (logo, supportEmail) is missing.

## Phase 2 – Auth & session hardening

1. **Multi-membership support**
   - Extend sessions to handle users with multiple tenants; add `/auth/switch-tenant` or host-redirect flow.
   - Portal renders tenant switcher when memberships > 1.
2. **Role hygiene**
   - Authorize actor role overrides against the tenant’s allowed roles list.
   - Ensure headless calls reject Super Admin contexts impersonating tenant scopes per instructions.
3. **Session lifecycle**
   - Implement silent refresh / proactive logout when JWT nearing expiration.
   - Include support email + guidance in error boundaries when auth fails.

## Phase 3 – Control plane integration

1. **Dynamic config sourcing**
   - Replace static JSON with pull from the tenant registry (REST or event-driven updates).
   - Support hot reload / cache invalidation hooks.
2. **Secrets management**
   - Move tenant API keys/OAuth secrets into managed vault references; inject via environment or secret store clients.
3. **Operational tooling**
   - Add health endpoints that enumerate loaded tenants (sans secrets) and flag stale configs.
   - Emit metrics for tenant resolution failures and headless call latency per tenant.
4. **Control plane web console**
   - Ship a Super-Admin-only web UI (separate from the learner portal) that authenticates with `SUPER_ADMIN` keys and talks to the control-plane API.
   - Core views: tenant list (status, last refresh, hostnames), tenant detail (branding/support metadata, OAuth + headless references), rotation actions (API key + Google secret), and activity log.
   - Provide guided flows for creating tenants (collect hosts, branding, feature flags, secret references) and exporting bundles for premium deployments.
   - Include health widgets (loader status, hot-reload history) plus buttons to trigger config refresh or download diagnostics bundles.

## Future enhancements

- **Feature rollout targeting** – Combine feature flags with cohort/role filters so portal can enable modules for specific learner groups.
- **Brand kit CDN** – Allow tenants to upload assets (logos, favicons, hero images) to a CDN and reference them from the config.
- **Localization hooks** – Store per-tenant locale defaults and optional translation bundles; load them during portal bootstrap.
- **Analytics dashboards** – Expose tenant analytics widgets that consume tagged logs/metrics described above.
- **Testing utilities** – Create smoke tests that iterate through every tenant host, hit `/health`, `/config`, `/auth/session`, and ensure branding + permissions are intact.

Keep this document updated as phases land so engineering, product, and ops share the same roadmap snapshot.
