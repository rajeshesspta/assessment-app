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

1. **Design control-plane API + schema** _(this doc)_
   - Finalize REST paths, request/response contracts, and DB schema.
2. **Implement Super Admin tenant registry service**
   - Scaffold `apps/control-plane-api` (Fastify, zod validation, SQLite repo, audit log).
   - Wire API key auth + endpoints listed above.
3. **Build control-plane web console UI**
   - Scaffold `apps/control-plane-console` (Vite React) with secure auth flow, tenant list/detail pages, and forms bound to the API.
4. **Add BFF tenant bundle hot-reload**
   - Extend `tenant-config-loader` to poll/control-plane API with `If-None-Match`; emit events to reload runtime bundle on change.
5. **Wire BFF to control-plane source**
   - Introduce provider interface so shared deployments call `/control/tenant-bundle`; premium mode continues to read local JSON.

This plan keeps the control plane isolated while giving Ops the tooling they need to manage tenants safely.
