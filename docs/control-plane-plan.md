# Control Plane Service & Console Plan

Design notes for the new Super Admin (Ops) control plane, delivered as a dedicated backend + web console separate from the learner portal.

## Objectives

- Provide a single source of truth for tenant metadata, branding tokens, host bindings, OAuth/headless credentials (via secret references), and feature flags.
- Allow Super Admins to create, update, deactivate, and audit tenants without touching the learner-facing portal.
- Supply the consumer BFF with a dynamic tenant bundle (same schema as `tenant-config.ts`) plus hot-reload signals.
- Expose health + diagnostics views so Ops can confirm each tenant’s status, see last refresh time, and trigger manual reloads.

## High-Level Architecture

```
apps/
  control-plane-api/      # Fastify + TypeScript service (ESM)
  control-plane-console/  # Vite/React admin UI (Super Admin only)
```

- **Auth**: Control plane APIs require `SUPER_ADMIN` credentials (initially via signed API keys in headers, later via OIDC + RBAC). Console talks only to the control-plane API, not the consumer BFF.
- **Storage**: Start with SQLite (same `data/sqlite` pattern) using a `tenant_registry` table; abstraction allows swapping to Cosmos DB later. Secrets stored as Key Vault references or env placeholders; raw secrets never returned to the console.
- **Bundle export**: `/control/tenant-bundle` returns a `TenantConfigBundle` for the BFF; responses include `etag/updatedAt` for caching.

## Current Implementation Snapshot

- `apps/control-plane-api` now exposes the Super Admin REST surface described below. The service boots with SQLite (`CONTROL_PLANE_DB_PROVIDER=sqlite`) by default and can target Cosmos DB by setting the `CONTROL_PLANE_COSMOS_*` variables.
- Repository logic follows the same pattern as our primary API: dependency-injected store adapters, `zod` validation, and Vitest coverage (`src/__tests__/tenant-registry-repository.spec.ts`).
- `GET /control/tenant-bundle` feeds the Consumer BFF. When `CONTROL_PLANE_BASE_URL` / `CONTROL_PLANE_API_KEY` are present, `apps/consumer-bff` polls the control plane and hot-reloads tenants on the interval defined by `TENANT_CONFIG_REFRESH_MS` (default 60s).
- Local setup: copy `.env.example` into `.env`, set a strong `CONTROL_PLANE_API_KEY`, run `npm install && npm run dev` inside `apps/control-plane-api`, and hit the endpoints with the header `x-control-plane-key: <your key>`.
- Health coverage: `GET /control/health` reports the tenant count so portal ops can confirm registry state before wiring the console.

## API Surface (v1)

| Method  | Path                           | Description                                                                                     |
| ------- | ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `GET`   | `/control/tenants`             | List tenants with summary (name, hosts, status, updatedAt).                                     |
| `POST`  | `/control/tenants`             | Create tenant (hosts, branding, feature flags, secret refs).                                    |
| `GET`   | `/control/tenants/:id`         | Detail view incl. branding, auth config (sans secrets), status, audit log tail.                 |
| `PATCH` | `/control/tenants/:id`         | Update metadata (hosts, colors, flags).                                                         |
| `POST`  | `/control/tenants/:id/rotate`  | Rotate headless API key and/or OAuth secrets (writes new secret references, emits audit event). |
| `POST`  | `/control/tenants/:id/refresh` | Mark tenant bundle dirty and trigger hot-reload notifications for BFF replicas.                 |
| `GET`   | `/control/tenant-bundle`       | Authenticated endpoint returning the full `TenantConfigBundle` for runtime ingestion.           |
| `GET`   | `/control/health`              | Service health plus counts of tenants, pending refreshes, last bundle build timestamp.          |

- All endpoints gated by middleware enforcing `x-control-plane-key` (Super Admin) until we wire OIDC.
- Responses include audit metadata (e.g., `updatedBy`, `lastRotatedAt`).

## Data Model Sketch

### `tenant_registry` table (SQLite for MVP)

| Column                 | Type      | Notes                                            |
| ---------------------- | --------- | ------------------------------------------------ |
| `id`                   | TEXT (PK) | Tenant ID (e.g., `tenant-demo`).                 |
| `name`                 | TEXT      | Display name.                                    |
| `hosts_json`           | TEXT      | JSON array of hostnames.                         |
| `support_email`        | TEXT      | Required contact.                                |
| `premium_deployment`   | INTEGER   | 0/1 flag.                                        |
| `headless_config_json` | TEXT      | Base URL, API key ref, tenant id, default roles. |
| `auth_config_json`     | TEXT      | OAuth providers + secret refs.                   |
| `client_app_json`      | TEXT      | Base URL + landing path.                         |
| `branding_json`        | TEXT      | Colors, assets.                                  |
| `feature_flags_json`   | TEXT      | Map of booleans.                                 |
| `status`               | TEXT      | `active`, `paused`, `deleting`.                  |
| `updated_at`           | TEXT      | ISO timestamp.                                   |
| `updated_by`           | TEXT      | Actor id / API key fingerprint.                  |

Audit entries (`tenant_audit_log`) capture CRUD operations, rotations, and refresh triggers.

## Control-Plane Console (UI)

- Stack: Vite + React + Tailwind (mirrors existing portals but with hardened auth).
- **Pages**:
  1. **Tenants list** – searchable table with status chips, host count, last refresh. Actions: "View", "Rotate", "Trigger Refresh".
  2. **Tenant detail** – read-only panels for branding, client app, feature flags, secret references; includes edit forms and activity log.
  3. **Create tenant wizard** – multi-step form (Basics → Hosts & Auth → Branding → Review). Validates hosts + ensures color hex codes.
  4. **Diagnostics** – charts/cards for loader health, outstanding refresh requests, and BFF sync status.
- Auth guard ensures only Super Admin sessions can access; UI stores minimal state (no secrets) and relies on short-lived tokens.

## Integration / Work Breakdown

- [x] **Design control-plane API + schema** _(this doc)_ – REST paths, schema, and migrations are locked in and reflected in the Fastify implementation.
- [x] **Implement Super Admin tenant registry service** – `apps/control-plane-api` ships with SQLite + Cosmos adapters, API-key auth, migrations, and repository tests.
- [x] **Build control-plane web console UI** – Vite dashboard reads `/control/tenants` through the proxy and surfaces status/metrics for Super Admins.
- [x] **Add BFF tenant bundle hot-reload** – `apps/consumer-bff` polls `/control/tenant-bundle` and refreshes the runtime maps when `updatedAt` changes.
- [x] **Wire BFF to control-plane source** – Set `CONTROL_PLANE_BASE_URL`, `CONTROL_PLANE_API_KEY`, optional `CONTROL_PLANE_BUNDLE_PATH`, and `TENANT_CONFIG_REFRESH_MS` to switch the BFF from static JSON to the registry; fall back to `TENANT_CONFIG_PATH`/`TENANT_CONFIG_JSON` for premium single-tenant stacks.

This plan keeps the control plane isolated while giving Ops the tooling they need to manage tenants safely.
