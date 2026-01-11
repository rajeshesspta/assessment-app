# Assessment App (MVP)

![Version](https://img.shields.io/badge/version-0.1.1-blue) ![Build](https://img.shields.io/badge/build-passing-brightgreen)

Headless assessment platform MVP in TypeScript + Fastify.

## Documentation

- **[Multi-Tenant Deployment Architecture](MULTI-TENANT-DEPLOYMENT-ARCHITECTURE.md)** - Complete deployment guide for production multi-tenant setups
- **[Domain Overview](docs/domain.md)** - Role hierarchy, user lifecycle, and data model
- **[Multi-Tenant Roadmap](docs/multi-tenant-roadmap.md)** - Implementation phases and future enhancements
- **[Control Plane Plan](docs/control-plane-plan.md)** - Super admin management and tenant provisioning
- **[Dev Portal](docs/dev-portal.md)** - Developer portal documentation

## Modules (MVP)

- Auth (API key)
- Tenant enforcement (header `x-tenant-id`)
- Item Bank (MCQ single/multi, TRUE_FALSE, fill-in-the-blank, matching, ordering/ranking, short-answer, essay/long-form, numeric entry, hotspot, drag-and-drop, scenario/coding tasks)
- Assessment Authoring (static list of item IDs)
- Attempt & Response Capture
- Cohort Management (tenant-managed learner groups + assessment assignments)
- User Management (tenant-scoped Content Authors, Learners, Raters; Super Admin-managed Tenant Admins)
- Scoring (auto for MCQ + structured types; short-answer, essay, and scenario tasks route events for manual/AI rubric or automation review)
- Analytics (attempt count + average score)
- Event Bus (in-memory pub/sub)

## Local Development & Seed Data

When running in development mode (`npm run dev`), the system automatically provisions and seeds the default tenants (including `dev-tenant`) with sample items, assessments, and the following test users:

| Display Name | Email | Default Role | Login Method |
| :--- | :--- | :--- | :--- |
| **Learner One** | `learner-1@rubicstricks.com` | `LEARNER` | `UPWD` (Email only) |
| **Author One** | `ca-1@rubicstricks.com` | `CONTENT_AUTHOR` | `UPWD` (Email only) |
| **Tenant Admin** | `ta-1@rubicstricks.com` | `TENANT_ADMIN` | `UPWD` (Email only) |

To reset the data for a specific tenant, use:
```bash
npm run db:reset -- --tenant=dev-tenant
```

## Domain Roles & Cohorts

- Super Admin: oversees the platform, provisions new tenants, and enforces global governance/compliance controls.
- Tenant Admin: provisions the tenant, manages API keys + rate limits, and enforces compliance policies.
- Content Author: curates the tenant’s item bank and assembles assessments from those shared items.
- Learner (Assessment Participant): receives cohort-based assignments, records responses, and reviews released feedback.
- Reviewer / Rater: scores deferred items (short-answer, essay, scenario tasks) and finalizes results. The Rater API role (`RATER`) is surfaced to clients via `GET /users/roles`.
- Proctor / Operations: monitors live attempts, unlocks sessions, and handles incident workflows.
- Analytics Consumer: pulls reporting/insights for cohorts, programs, or compliance exports.

### Role Hierarchy & Permissions

1. **Super Admin** (platform-scope)
   - Lives in the system tenant (`sys-tenant`) but can impersonate any tenant scope for admin-only operations.
   - Creates tenants, rotates global API keys, and seeds each tenant with at least one Tenant Admin user via `POST /tenants/:id/admins`.
   - Delegates management by generating tenant-scoped API credentials and invitations for Tenant Admins; when impersonating a tenant, the Super Admin is limited to managing that tenant’s admins and lifecycle events.
2. **Tenant Admin** (per-tenant)

- Manages tenant configuration, rotates tenant API keys, and creates Content Author, Learner, and Rater accounts via `/users` endpoints (see `GET /users/roles` for the authoritative list).
- Owns cohort administration (grouping learners) and can manage items/assessments alongside authors.

3. **Content Author** (per-tenant)
   - Creates new items or reuses any items authored within the same tenant.
   - Builds assessments, sets the maximum attempts allowed, and assigns them to cohorts or individual learners.
4. **Learner**
   - Launches attempts for assignments targeted to them (directly or via cohort membership).
   - Each attempt is scoped by `{ tenantId, assessmentId, learnerId }` to enforce isolation and attempt limits.

### Super Admin Provisioning API

- Use `POST /tenants` with headers `x-tenant-id: <SUPER_ADMIN_TENANT_ID>` (default `sys-tenant`) and `x-api-key: <SUPER_ADMIN_API_KEY>` to create a new tenant record.
- When managing an existing tenant’s admins, the Super Admin can keep using the same API key while setting `x-tenant-id` to that tenant’s id—authorization succeeds because the Super Admin identity (rooted in `sys-tenant`) is allowed to impersonate any tenant scope.
- Request body mirrors the schema defined in `src/modules/tenants/tenant.routes.ts` (`name`, `contactEmail`, optional `slug`, optional `apiKey`, rate-limit overrides, etc.).
- Successful responses return the persisted tenant plus the bootstrap API key to hand off to the first Tenant Admin.

Once a tenant exists, the Super Admin keeps using the same platform API key but must set `x-tenant-id` to the target tenant when calling `POST /tenants/:id/admins`. This header requirement ensures impersonation stays scoped to the intended tenant when creating tenant admins.

### Tenant User Management API

- `POST /tenants/:id/admins`: Super Admin–only route; requires `x-tenant-id` header that matches the target tenant id/slug. Creates a tenant admin record and returns the persisted user.
- `POST /users`: Tenant-level route (Tenant Admin contexts); creates Content Authors, Learners, or Raters. Provide a non-empty `roles` array (values drawn from `GET /users/roles`); duplicates are deduped server-side. Duplicate emails per tenant return `409`.
- `GET /users/roles`: Tenant-level route for any authenticated caller; returns the canonical list of tenant-manageable roles so portals and SDKs stay in sync with backend enums.

### End-to-End Workflow (Happy Path)

1. **Super Admin bootstraps a tenant**

- Call `POST /tenants` with the Super Admin API key (`x-tenant-id=sys-tenant` by default) to create tenant metadata and receive the tenant-scoped API key.
- Immediately call `POST /tenants/:id/admins` (still authenticated as Super Admin but with `x-tenant-id=<tenantId>`) to invite at least one Tenant Admin.

2. **Tenant Admin locks down the tenant**

- Exchanges the tenant API key for all future calls (`x-tenant-id=<tenantId>`).
- Calls `POST /users` to invite Content Authors, Learners, and optional Raters; duplicates are rejected per-tenant.
- Seeds initial cohorts with `POST /cohorts`, ensuring each learner id corresponds to a stored user that includes the `LEARNER` role.

3. **Content Authors assemble content**

- Use `/items` to author questions and `/assessments` to group them, specifying `allowedAttempts` per learner (defaults to `1`).
- Coordinate with Tenant Admins to attach assessments to cohorts via `POST /cohorts/:id/assessments` so every learner inherits the assignment.

4. **Learners complete assigned work**

- `POST /attempts` receives `assessmentId`/`userId`, validates that the learner exists, belongs to a cohort that includes the requested assessment, and has remaining `allowedAttempts`.
- Subsequent PATCH/submit routes capture responses and scoring; analytics surfaces completed attempt counts per assessment.

### Actor Role Header

- Every authenticated request should declare the caller’s tenant-scoped roles via `x-actor-roles`. Provide a comma-separated list (e.g., `CONTENT_AUTHOR,LEARNER`); the auth middleware normalizes case, dedupes, and exposes the result on `request.actorRoles`.
- When omitted, tenant-bound API keys default to `['TENANT_ADMIN']` and the Super Admin key defaults to `['SUPER_ADMIN']`, but portals should always send explicit roles so downstream route guards can enforce permissions for learners vs. authors vs. raters.
- Item endpoints (`/items`, `/items/:id`) and cohort endpoints (`/cohorts`, `/cohorts/:id/*`) require either the `CONTENT_AUTHOR` or `TENANT_ADMIN` role, and Super Admin identities are explicitly blocked. If a Super Admin needs to curate content or manage cohorts, they must invite a Tenant Admin or Content Author within that tenant instead of calling the routes directly.

Both endpoints rely on the `users` table (`migrations/sqlite/013_users_table.sql`) plus the follow-up `014_users_roles_json.sql` migration that stores multi-role assignments. After pulling these changes, run `npm run db:migrate -- --all-tenants` (or target individual tenants) so every tenant database gains the new schema before invoking the APIs.

Cohort APIs rely on the `cohorts` table introduced in `migrations/sqlite/015_cohorts_table.sql`. Run the same migration command (all tenants or one-by-one) after upgrading so cohort routes have the required schema.

Attempt limits and learner-scoped indexes depend on `migrations/sqlite/016_assessment_attempt_limits.sql`, which adds the `allowed_attempts` column plus an index on `(tenant_id, assessment_id, user_id)`. Apply this migration for every tenant before relying on the new validations.

For deeper implementation details (role lifecycle, APIs, data model), see `docs/domain.md`.

### Cohorts

- Cohort: a logical group of learners (class, onboarding batch, pilot program) used for assessment assignments, accommodations, and analytics rollups.
- Cohort assignments let Super Admins or Tenant Admins (often partnering with Authors) schedule assessments once and deliver them to every learner in that cohort, while analytics surfaces completion/performance per cohort. Content Authors can also target specific cohorts when scheduling an assessment.
- Tenant Admins or Content Authors create cohorts via `POST /cohorts`, providing a name, optional description, and at least one learner id (only users with the `LEARNER` role are accepted). Optional assessment ids can be included at creation time.
- Use `POST /cohorts/:id/assessments` to add additional assessments later. The service validates that every referenced assessment exists before persisting the assignment. You can optionally provide `allowedAttempts` in the `assignments` array to override the assessment's default limit for that cohort.
- Use `POST /cohorts/assignments/users/:userId` to assign assessments directly to an individual learner. This creates or updates a personal cohort for the user.
- `GET /cohorts` returns the tenant’s cohorts so portals can display membership and assignment data. Super Admin callers are blocked from these routes to reinforce tenant-managed ownership.
- Learners can only launch attempts for assessments assigned to at least one of their cohorts (directly or via group membership), and `POST /attempts` enforces both cohort membership and the per-assignment `allowedAttempts` limit (falling back to the assessment default).

## Running

```powershell
npm install
npm test
npm run build
npm run dev
npm run dev:control-plane # starts API + proxy + console
```

The dev server uses `tsx watch` and listens on `http://127.0.0.1:3000` by default. Cosmos DB is optional; with the default `AUTH_PROVIDER=memory` no emulator or cloud dependency is required.

### Developer Portal

- `npm run dev:portal` launches the Vite-powered portal at `http://127.0.0.1:5173`. Set `VITE_API_BASE_URL` to point the portal at a remote API (defaults to `http://localhost:3000`).
- `npm run build:portal` outputs a static bundle in `apps/dev-portal/dist` (serve via any static host).
- The portal proxies `/docs` to the API during local dev so interactive Swagger UI continues to function without extra CORS wiring.
- See `docs/dev-portal.md` for an end-to-end workflow covering bootstrap scripts, Postman imports, and deployment tips.

### Consumer Portal (Tenant Learner App)

- `npm run dev:consumer:bff` starts the local BFF at `http://127.0.0.1:4000`; `npm run dev:consumer` launches the Vite portal at `http://127.0.0.1:5173` (override via `VITE_PORT`).
- Learners can sign in via Google, Microsoft, or custom credentials before entering the dashboard; the in-app navigation surfaces My Assessments, Analytics, and resource links.
- The portal session banner now only asks for the BFF base URL (defaults to `/api`), learner id, and optional actor roles—the BFF keeps the tenant API key + id inside its `.env` file.
- All learner calls (`GET /analytics/assessments/:id`, `POST /attempts`, `GET /attempts/:id`) flow through the BFF, which injects tenant headers before calling the headless API.
- `/api/*` requests are proxied to the BFF during dev (override with `VITE_PROXY_API` or edit `apps/consumer-portal/.env.local`).

### Consumer BFF

- Fastify proxy that frontends the headless API with tenant credentials pulled from environment variables.
- Copy `apps/consumer-bff/.env.example` to `.env` and set `HEADLESS_API_BASE_URL`, `CONSUMER_API_KEY`, `CONSUMER_TENANT_ID`, and optional `CONSUMER_ACTOR_ROLES`.
- `npm run dev:consumer:bff` runs the watcher; `npm run build:consumer:bff && npm start --workspace consumer-bff` produces and launches the compiled server.

### API Docs

- `GET /docs`: Interactive Swagger UI backed by the live OpenAPI spec.
- `GET /docs/json`: Raw OpenAPI 3.0 document (useful for Postman/Insomnia imports).
- Set `API_PUBLIC_URL` to change the server URL advertised inside the spec (defaults to `http://localhost:3000`).

### Database Provisioning (SQLite)

The following commands help you manage the local SQLite databases.

#### 1. System Initialization (Run First)

- `npm run db:seed:init`: **Bootstraps the system.** Creates the System Tenant (`sys-tenant`) and the first Super Admin user (`admin@bettershift.com`).
  - _Why:_ You cannot use the API without a valid user/tenant. This script creates the "root" user directly in the database.
  - _Alias:_ `npm run db:bootstrap` (does the same thing).

#### 2. Tenant Management

- `npm run db:provision -- --tenant=<tenantId>`: **Creates or updates a tenant database.**
  - Applies the latest schema migrations.
  - By default, seeds a sample item and assessment (pass `--seed=false` to skip).
  - _Use when:_ You want to create a new tenant manually or update an existing one's schema.

#### 3. Data Seeding (Development)

- `npm run db:seed -- --tenant=<tenantId>`: **Seeds sample content.**
  - Adds a basic set of items and assessments to a specific tenant.
  - Safe to run multiple times (idempotent).
  - _Use when:_ You have a blank tenant and want some "Hello World" content.
- `npm run db:seed:random-data -- --tenant=<tenantId> [--items=12 --assessments=4 --attempts=10 --append]`: **Seeds bulk random data.**
  - Generates realistic data for load testing or demos (Items, Assessments, Attempts).
  - _Use when:_ You need a "lived-in" database to test analytics or performance.

#### 4. Maintenance & Utilities

- `npm run db:migrate [-- --tenant=<tenantId> | -- --all-tenants]`: **Applies schema changes.**
  - Runs SQL migration files (e.g., `013_users_table.sql`) against tenant databases.
  - _Use when:_ You've pulled code updates that include new database tables or columns.
- `npm run db:clear -- --tenant=<tenantId>`: **Wipes data.**
  - Deletes all Attempts, Assessments, and Items, but keeps the database schema intact.
  - _Use when:_ You want a fresh start for a tenant without deleting the database file itself.
- `npm run db:reset -- --tenant=<tenantId>`: **Full Reset.**

  - Clears data and re-runs the default seed.
  - _Use when:_ You want to return a tenant to its "factory default" state.

- SQLite persistence uses the WebAssembly-powered [`sql.js`](https://github.com/sql-js/sql.js) runtime, so no native toolchains or Python installs are required. Databases are materialized as files under `data/sqlite/` using the configured file pattern.

## Configuration

- `AUTH_PROVIDER`: `memory` (default) or `cosmos` for API-key storage. Memory provider uses seeded keys and avoids Cosmos entirely.
- `COSMOS_ENDPOINT` / `COSMOS_KEY`: Cosmos DB account endpoint and key (defaults to local emulator).
- `COSMOS_DATABASE_ID`: Database name to host feature containers (default `assessment-app`).
- `COSMOS_API_KEYS_CONTAINER`: Container for API key records (default `api-keys`).
- `API_KEY_CACHE_TTL_MS`: Optional TTL for the in-memory API-key cache (default `60000`).
- `API_KEY` and `API_TENANT_ID`: Optional seed key for bootstrapping (useful for local dev).
- `SUPER_ADMIN_API_KEY`: Platform-level key used with `x-tenant-id=sys-tenant` (or custom `SUPER_ADMIN_TENANT_ID`) to provision new tenants. Defaults to `sys-admin-key` for local dev.
- `SUPER_ADMIN_TENANT_ID`: Header value representing the Super Admin identity (default `sys-tenant`).
- `DB_PROVIDER`: Selects the repository bundle (`sqlite`, `memory`, or `cosmos`; default `sqlite`).
- `SQLITE_DB_ROOT`: Directory where tenant databases are created when using SQLite (default `./data/sqlite`).
- `SQLITE_DB_FILE_PATTERN`: Pattern for tenant database filenames (supports `{tenantId}` token).
- `SQLITE_MIGRATIONS_DIR`: Location of SQLite migration SQL files (default `./migrations/sqlite`).
- `SQLITE_SEED_DEFAULT_TENANT`: When `true`, seed default tenant data during provisioning commands.
- `.env.sample`: copy to `.env` for local configuration; values default to Cosmos DB Emulator + dev credentials.

When using the [Cosmos DB Emulator](https://learn.microsoft.com/azure/cosmos-db/emulator), keep the default endpoint `https://localhost:8081/` and key `C2y6yDjf5/R+ob0N8A7Cgv30VRDjEwef4zE3DUdh2PQ==`.

## Testing

- Unit and route coverage provided via [Vitest](https://vitest.dev/).
- `npm test` runs the full suite (auth middleware, items/assessments/attempts/analytics routes, scoring service, common utilities, config loader, Fastify bootstrap).
- `npx vitest run --coverage` generates `coverage/` reports (ignored by git).

## API (Summary)

- POST /items (supports MCQ, TRUE_FALSE, fill-in-the-blank, matching, ordering, short-answer, essay, numeric entry, hotspot, drag-and-drop, scenario tasks; requires `CONTENT_AUTHOR` or `TENANT_ADMIN` via `x-actor-roles` and rejects Super Admin callers)
- GET /items (search + optional `kind=MCQ|TRUE_FALSE|FILL_IN_THE_BLANK|MATCHING|ORDERING|SHORT_ANSWER|ESSAY|NUMERIC_ENTRY|HOTSPOT|DRAG_AND_DROP|SCENARIO_TASK` filter; same role requirements and Super Admin callers are rejected)
- Ordering responses submit `orderingAnswer` (array of option ids) and support either binary (`mode: all`) or partial pairwise credit (`mode: partial_pairs`).
- Short-answer responses submit `textAnswer` or `textAnswers[0]`; essay responses submit `essayAnswer`. Both emit `FreeResponseEvaluationRequested` events so reviewers or AI rubric services can assign up to the configured `maxScore`. Scenario tasks submit `scenarioAnswer` (repository/artifact links, submission notes, supporting files) and emit `ScenarioEvaluationRequested` events so automation pipelines or reviewers can perform evaluation before the attempt is scored. Numeric entry responses submit `numericAnswer.value` (with optional `unit`) and are auto-scored using either exact-with-tolerance or range validation.
- GET /items/:id (requires `CONTENT_AUTHOR` or `TENANT_ADMIN`; Super Admin callers receive HTTP 403)
- POST /cohorts (creates a tenant-managed cohort with one or more learners and optional assessments; requires `CONTENT_AUTHOR` or `TENANT_ADMIN` and rejects Super Admin callers)
- GET /cohorts (lists cohorts for the tenant; same role requirements)
- POST /cohorts/:id/assessments (assigns additional assessments to an existing cohort; same role requirements)
- POST /assessments (creates assessments with required `title`, `itemIds[]`, and optional `allowedAttempts` cap per learner)
- GET /assessments/:id
- POST /attempts (start; validates learner existence/role, cohort assignment for the requested assessment, and remaining `allowedAttempts`)
- PATCH /attempts/:id/responses (partial save)
- POST /attempts/:id/submit
- GET /attempts/:id
- GET /analytics/assessments/:id
- GET /analytics/assessments/:id/summary
- GET /analytics/assessments/:id/funnel
- GET /analytics/assessments/:id/attempts-usage
- GET /analytics/assessments/:id/items/most-missed
- POST /tenants/:id/admins (Super Admin only; creates tenant admins while impersonating the tenant)
- POST /users (Tenant Admin contexts; invites Content Authors, Learners, or Raters via a non-empty `roles[]` payload)
- GET /users/roles (lists tenant-manageable roles: `CONTENT_AUTHOR`, `LEARNER`, `RATER`)

Headers required: `x-api-key`, `x-tenant-id`, and `x-actor-roles` (comma-separated roles) for any route that enforces role-specific permissions (e.g., `/items`).

## Tenant-Scoped Content

- Item banks, assessments, attempts, and cohorts are always isolated per tenant; authors within the same tenant can reuse each other’s items, but nothing leaks across tenants unless explicitly exported/imported.
- API calls must include the correct `x-tenant-id` so repository bundles (SQLite, memory, Cosmos) load the right data slice.

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
