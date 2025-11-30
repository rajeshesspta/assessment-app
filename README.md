# Assessment App (MVP)

Headless assessment platform MVP in TypeScript + Fastify.

## Modules (MVP)

- Auth (API key)
- Tenant enforcement (header `x-tenant-id`)
- Item Bank (MCQ single/multi, TRUE_FALSE, fill-in-the-blank, matching, ordering/ranking, short-answer, essay/long-form, numeric entry, hotspot, drag-and-drop, scenario/coding tasks)
- Assessment Authoring (static list of item IDs)
- Attempt & Response Capture
- User Management (tenant-scoped Content Authors + Learners, Super Admin-managed Tenant Admins)
- Scoring (auto for MCQ + structured types; short-answer, essay, and scenario tasks route events for manual/AI rubric or automation review)
- Analytics (attempt count + average score)
- Event Bus (in-memory pub/sub)

## Domain Roles & Cohorts

- Super Admin: oversees the platform, provisions new tenants, and enforces global governance/compliance controls.
- Tenant Admin: provisions the tenant, manages API keys + rate limits, and enforces compliance policies.
- Content Author: curates the tenant’s item bank and assembles assessments from those shared items.
- Learner (Assessment Participant): receives cohort-based assignments, records responses, and reviews released feedback.
- Reviewer / Rater: scores deferred items (short-answer, essay, scenario tasks) and finalizes results.
- Proctor / Operations: monitors live attempts, unlocks sessions, and handles incident workflows.
- Analytics Consumer: pulls reporting/insights for cohorts, programs, or compliance exports.

### Role Hierarchy & Permissions

1. **Super Admin** (platform-scope)
   - Lives in the system tenant (`sys-tenant`) but can impersonate any tenant scope for admin-only operations.
   - Creates tenants, rotates global API keys, and seeds each tenant with at least one Tenant Admin user via `POST /tenants/:id/admins`.
   - Delegates management by generating tenant-scoped API credentials and invitations for Tenant Admins; when impersonating a tenant, the Super Admin is limited to managing that tenant’s admins and lifecycle events.
2. **Tenant Admin** (per-tenant)
   - Manages tenant configuration, rotates tenant API keys, and creates Content Author + Learner accounts via `/users` endpoints.
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
- `POST /users`: Tenant-level route (Tenant Admin contexts); creates Content Authors or Learners. Duplicate emails per tenant return `409`.

Both endpoints rely on the new `users` table (`migrations/sqlite/013_users_table.sql`). After pulling these changes, run `npm run db:migrate -- --all-tenants` (or target individual tenants) so every tenant database gains the new schema before invoking the APIs.

For deeper implementation details (role lifecycle, APIs, data model), see `docs/domain.md`.

### Cohorts

- Cohort: a logical group of learners (class, onboarding batch, pilot program) used for assessment assignments, accommodations, and analytics rollups.
- Cohort assignments let Super Admins or Tenant Admins (often partnering with Authors) schedule assessments once and deliver them to every learner in that cohort, while analytics surfaces completion/performance per cohort. Content Authors can also target specific cohorts when scheduling an assessment.

## Running

```powershell
npm install
npm test
npm run build
npm run dev
```

The dev server uses `tsx watch` and listens on `http://127.0.0.1:3000` by default. Cosmos DB is optional; with the default `AUTH_PROVIDER=memory` no emulator or cloud dependency is required.

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

- POST /items (supports MCQ, TRUE_FALSE, fill-in-the-blank, matching, ordering, short-answer, essay, numeric entry, hotspot, drag-and-drop, scenario tasks)
- GET /items (search + optional `kind=MCQ|TRUE_FALSE|FILL_IN_THE_BLANK|MATCHING|ORDERING|SHORT_ANSWER|ESSAY|NUMERIC_ENTRY|HOTSPOT|DRAG_AND_DROP|SCENARIO_TASK` filter)
- Ordering responses submit `orderingAnswer` (array of option ids) and support either binary (`mode: all`) or partial pairwise credit (`mode: partial_pairs`).
- Short-answer responses submit `textAnswer` or `textAnswers[0]`; essay responses submit `essayAnswer`. Both emit `FreeResponseEvaluationRequested` events so reviewers or AI rubric services can assign up to the configured `maxScore`. Scenario tasks submit `scenarioAnswer` (repository/artifact links, submission notes, supporting files) and emit `ScenarioEvaluationRequested` events so automation pipelines or reviewers can perform evaluation before the attempt is scored. Numeric entry responses submit `numericAnswer.value` (with optional `unit`) and are auto-scored using either exact-with-tolerance or range validation.
- GET /items/:id
- POST /assessments
- GET /assessments/:id
- POST /attempts (start)
- PATCH /attempts/:id/responses (partial save)
- POST /attempts/:id/submit
- GET /attempts/:id
- GET /analytics/assessments/:id
- POST /tenants/:id/admins (Super Admin only; creates tenant admins while impersonating the tenant)
- POST /users (Tenant Admin contexts; invites Content Authors or Learners)

Headers required: `x-api-key`, `x-tenant-id`.

## Tenant-Scoped Content

- Item banks, assessments, attempts, and cohorts are always isolated per tenant; authors within the same tenant can reuse each other’s items, but nothing leaks across tenants unless explicitly exported/imported.
- API calls must include the correct `x-tenant-id` so repository bundles (SQLite, memory, Cosmos) load the right data slice.
