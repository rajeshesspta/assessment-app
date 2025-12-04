# Multi-tenant BFF + Portal Roadmap

Reference plan that guides the shared vs premium deployment workstreams for the Consumer BFF and Portal.

## Goals

- Serve many tenants from a shared stack without leaking data, secrets, or branding.
- Keep premium (single-tenant) deployments aligned with the shared stack while allowing isolated overrides.
- Provide a consistent developer experience so routing, auth, and theming work the same locally and in prod.

## Phase 1 – Baseline runtime ✅

1. **Tenant config bundle** – Schema + runtime bundle builder live in `apps/consumer-bff/src/tenant-config.ts` & `tenant-config-loader.ts`.
2. **Tenant-aware request flow** – Host-based resolution, session cookies, and headless proxy headers ship today.
3. **Config endpoint + portal bootstrap** – `/config` & `/auth/session` return branding + feature flags; portals already rely on them.
4. **Logging + observability** – Fastify logger tags each request with `tenantId`/host; missing metadata warnings go to logs.

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

## Phase 3 – Control plane integration (in flight)

1. **Dynamic config sourcing** – ✅ `apps/control-plane-api` exposes `/control/tenant-bundle`; the BFF now polls it whenever `CONTROL_PLANE_BASE_URL` / `CONTROL_PLANE_API_KEY` are set and hot-reloads based on `updatedAt`.
2. **Secrets management** – 🔄 Track secret references in the `tenant_registry` JSON blobs (still backed by env placeholders). Next step: plug in Key Vault / secret store clients before shipping console rotations.
3. **Operational tooling** – 🆕 `/control/health` surfaces tenant counts; add metrics & alerts once we deploy the registry to staging.
4. **Control plane web console** – 🟥 Not started. Needs a Vite/React app that authenticates via the Super Admin key (initially) and drives the CRUD/audit flows on top of the API.

### BFF environment knobs

Set the following when you want the consumer BFF to follow the registry instead of static JSON:

- `CONTROL_PLANE_BASE_URL` – e.g., `http://localhost:4500`.
- `CONTROL_PLANE_API_KEY` – must match the control plane’s `.env`.
- `CONTROL_PLANE_BUNDLE_PATH` (optional) – override when exposing the bundle behind another path or gateway.
- `TENANT_CONFIG_REFRESH_MS` – poll interval for hot reloads (defaults to 60s). Premium single-tenant deployments can omit these variables and continue using `TENANT_CONFIG_PATH`/`TENANT_CONFIG_JSON`.

## Future enhancements

- **Feature rollout targeting** – Combine feature flags with cohort/role filters so portal can enable modules for specific learner groups.
- **Brand kit CDN** – Allow tenants to upload assets (logos, favicons, hero images) to a CDN and reference them from the config.
- **Localization hooks** – Store per-tenant locale defaults and optional translation bundles; load them during portal bootstrap.
- **Analytics dashboards** – Expose tenant analytics widgets that consume tagged logs/metrics described above.
- **Testing utilities** – Create smoke tests that iterate through every tenant host, hit `/health`, `/config`, `/auth/session`, and ensure branding + permissions are intact.

Keep this document updated as phases land so engineering, product, and ops share the same roadmap snapshot.
