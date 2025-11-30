# Developer Portal & Workflow Guide

This document explains how to bootstrap a local environment, run the new developer portal, and access the assets that help teams explore the headless assessment APIs.

## Prerequisites

- Node.js 20+
- npm 10+
- SQLite databases provisioned via the included scripts (see below)

## 1. Bootstrap the Platform

Run these steps once per machine:

```bash
npm install
npm run db:seed:init            # creates sys-tenant + Super Admin
npm run db:provision -- --tenant=tenant-demo
npm run db:seed -- --tenant=tenant-demo
```

Result: a system tenant (`sys-tenant`) with `admin@bettershift.com`, plus a demo tenant (`tenant-demo`) seeded with sample items/assessments.

## 2. Run API & Portal Side by Side

Terminal A:

```bash
npm run dev                     # Fastify API on http://localhost:3000
```

Terminal B:

```bash
npm run dev:portal              # Vite portal on http://localhost:5173
```

Environment variables:

| Variable            | Default                 | Purpose                                                          |
| ------------------- | ----------------------- | ---------------------------------------------------------------- |
| `API_PUBLIC_URL`    | `http://localhost:3000` | Advertised server URL inside the OpenAPI spec.                   |
| `VITE_API_BASE_URL` | `http://localhost:3000` | Portal fetch base (set this when pointing at staging/prod APIs). |

During local dev the portal proxies `/docs` to the API so embedded Swagger UI works without extra CORS settings.

## 3. Explore the API

### Swagger / OpenAPI

- `GET http://localhost:3000/docs` → interactive Swagger UI.
- `GET http://localhost:3000/docs/json` → raw OpenAPI document (import into Postman/Insomnia).

### Postman / Insomnia

1. Choose _Import from URL_ and paste `http://localhost:3000/docs/json` (or the remote URL).
2. Set collection-level variables:
   - `baseUrl = https://your-api-host`
   - `x-api-key = <tenant_api_key>`
   - `x-tenant-id = <tenant_id>`
3. Save & send requests directly from the collection.

### CLI / cURL

```bash
curl -X GET "$VITE_API_BASE_URL/items" \
  -H "x-api-key: <tenant_api_key>" \
  -H "x-tenant-id: <tenant_id>"
```

## 4. Provision Additional Sandboxes

| Step              | Command                                                                   | Notes                         |
| ----------------- | ------------------------------------------------------------------------- | ----------------------------- |
| Create tenant DB  | `npm run db:provision -- --tenant=<id>`                                   | Applies migrations.           |
| Seed base content | `npm run db:seed -- --tenant=<id>`                                        | Items + assessments.          |
| Seed random data  | `npm run db:seed:random-data -- --tenant=<id> --items=12 --assessments=4` | Optional analytics load.      |
| Reset tenant      | `npm run db:reset -- --tenant=<id>`                                       | Clears + reseeds sample data. |

Automated sandbox endpoint (`POST /sandbox/tenants`) is planned; until then use the scripts above.

## 5. Deploy the Portal

```bash
npm run build:portal
```

Outputs `apps/dev-portal/dist`. Deploy via any static host (Azure Static Web Apps, Vercel, Blob Storage, etc.). Set `VITE_API_BASE_URL` during build/deploy to point at the target API environment.

## 6. Asset Checklist

| Asset            | Location              | Description                                            |
| ---------------- | --------------------- | ------------------------------------------------------ |
| OpenAPI Spec     | `/docs/json`          | Source of truth for API reference + SDK generation.    |
| Swagger UI       | `/docs`               | Interactive explorer embedded inside the portal.       |
| Developer Portal | `apps/dev-portal`     | Quickstart, sample requests, resource links.           |
| SQLite Scripts   | `scripts/sqlite/*.ts` | Provisioning + seeding flows referenced by the portal. |

Keep this guide nearby when onboarding teammates or publishing external docs. It ties the CLI steps, portal UI, and API specification together so developers can go from zero to first API call in minutes.
