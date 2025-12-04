# Consumer Portal

Tenant-facing learner portal that drives the headless Fastify assessment APIs. The goal is to exercise the public surface area a customer-facing application would call: configure tenant headers, fetch analytics, and launch attempts as a learner.

## Quick start

```bash
npm install
npm run dev --workspace consumer-bff   # boots http://localhost:4000
npm run dev --workspace consumer-portal
```

Then open `http://localhost:5173` (configurable via `VITE_PORT`/`VITE_HOST`). Use the login screen to sign in with Google, Microsoft, or tenant credentials; once authenticated you land on a responsive dashboard with navigation, profile controls, and the My Assessments workspace. The dev server still proxies `/api/*` calls to your consumer BFF (default `http://localhost:4000`). In the session banner, leave the base URL as `/api` (works with the proxy) or enter a fully-qualified BFF URL, provide the learner id, and optionally tweak the actor roles header. Secrets stay in the BFF `.env`; the portal only persists non-sensitive context in `localStorage`. Once saved you can:

1. Look up assessment analytics via `GET /analytics/assessments/:id`.
2. Kick off new attempts via `POST /attempts` (learner role enforced).
3. Refresh attempt status via `GET /attempts/:id`.

The UI persists session details in `localStorage` to streamline demos.

> Tip: copy `.env.example` to `.env.local` when you need to override `VITE_HOST`, `VITE_PORT`, or point the proxy at a remote BFF.

## Environment

| Env var          | Description                                                                                      | Default                 |
| ---------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| `VITE_HOST`      | Host the Vite dev server binds to (use `0.0.0.0` to allow LAN access).                           | `0.0.0.0`               |
| `VITE_PORT`      | Dev server port.                                                                                 | `5173`                  |
| `VITE_PROXY_API` | Proxy target for `/api` requests during dev. Defaults to `http://localhost:4000` (consumer BFF). | `http://localhost:4000` |

## Multi-tenant BFF + Portal Plan

1. **Tenant registry** – Control plane stores tenant ids, branding tokens, feature flags, auth provider info, subdomains/custom domains, and API keys. Operators update this registry and secrets vault via admin tooling and automation.
2. **Config loading** – Shared BFF deployment loads all tenant configs + secrets into memory (or fetches on demand) and refreshes periodically. Premium/isolated deployments load only their tenant.
3. **Tenant-aware auth** – Login endpoints accept a tenant hint (subdomain, slug, or explicit id), select that tenant’s OAuth client config, run the flow, and mint sessions that record `{ tenantId, userId, roles }`. Support tenant switching for multi-tenant users.
4. **Scoped API proxying** – For each request to the headless API, the BFF injects the tenant’s `x-tenant-id`, API key, and actor roles derived from the session. Requests are rejected if the tenant is disabled or missing config.
5. **Branding + features** – The BFF exposes `/config` (or extends `/auth/session`) with design tokens, logo URLs, and feature flags. The portal applies these at runtime (CSS variables, logos, conditional navigation) to deliver per-tenant experiences.
6. **Portal boot flow** – On load, the portal fetches session + config, sets theme variables, enables tenant-specific modules, and optionally renders a tenant switcher when the user belongs to more than one tenant.
7. **Isolation & observability** – Repository calls always filter by `tenantId`; logs/metrics include tenant ids. Premium tenants run dedicated stacks (BFF + portal + headless) seeded with only their config, while the shared stack hosts many tenants safely.

## Architecture
