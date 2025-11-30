# Copilot Instructions

## Architecture & Patterns

- Fastify + TypeScript (native ESM) app rooted in `src/`; `buildApp` wires auth, tenant routing, and per-module routes (`src/modules/**`). Each module exposes `*.routes.ts`, repositories, and tests in `__tests__`. The new `users` module follows the same pattern—inject its repository and register routes alongside items/assessments/attempts/tenants.
- Persistence is abstracted behind repository bundles. Default provider is SQLite via `sql.js` (see `src/infrastructure/sqlite/**`), but memory and Cosmos implementations exist; do not instantiate databases directly—inject the appropriate repository through options.
- Multi-tenant enforcement relies on the `x-tenant-id` header and repositories expect the tenant id as their first parameter. Always preserve this signature when adding repository APIs.
- Validation consistently uses `zod` schemas near route handlers. Follow the pattern in `src/modules/items/item.routes.ts` and `src/modules/attempts/attempt.routes.ts` when introducing new endpoints.
- Domain entities live in `src/common/types.ts`. Items now form a discriminated union: choice-based (`kind: 'MCQ' | 'TRUE_FALSE'`) with `answerMode`/`correctIndexes`, fill-in-the-blank (`kind: 'FILL_IN_THE_BLANK'`) with `blanks[]` + matcher metadata and `scoring.mode ('all' | 'partial')`, matching (`kind: 'MATCHING'`) with `prompts[]`, `targets[]`, and scoring rules, ordering (`kind: 'ORDERING'`) with `options[]`, `correctOrder[]`, and `scoring.mode ('all' | 'partial_pairs' | custom evaluator)`, short-answer (`kind: 'SHORT_ANSWER'`) with optional rubric keywords/guidance plus `scoring.mode ('manual' | 'ai_rubric')`, essay (`kind: 'ESSAY'`) with rubric sections, length expectations, and manual/AI rubric scoring, numeric entry (`kind: 'NUMERIC_ENTRY'`) with exact-or-range validation plus optional units metadata, hotspot (`kind: 'HOTSPOT'`) with image metadata and polygon scoring, drag-and-drop (`kind: 'DRAG_AND_DROP'`) with token/zone schemas, and scenario/coding tasks (`kind: 'SCENARIO_TASK'`) that include workspace templates, attachments, automation metadata, and rubric scoring. Attempts capture `answerIndexes`, `textAnswers`, `matchingAnswers`, `orderingAnswer`, `essayAnswer`, `numericAnswer`, `hotspotAnswers`, `dragDropAnswers`, and `scenarioAnswer`; keep these shapes in sync with persistence + repositories. User roles are centralized via `USER_ROLES`/`TENANT_USER_ROLES` constants—never hardcode strings outside `src/common/types.ts`.

## Domain Terminology

- Super Admin resides in the system tenant (`sys-tenant`), oversees the platform, provisions tenants, rotates global API keys, and can impersonate tenant scopes to manage only their tenant admins. Calls to `POST /tenants/:id/admins` must set `x-tenant-id` to the tenant being managed or they fail with HTTP 400.
- Tenant Admin provisions tenants, rotates API keys, and manages cohorts + access policies. They create Content Authors/Learners/Raters via `POST /users` (per the `TENANT_USER_ROLES` constant + `GET /users/roles`). The request must include a non-empty `roles[]` array; duplicate emails per tenant should return HTTP 409.
- Content Authors share a tenant-wide item bank; items are automatically visible to other authors within the same tenant but never leak across tenants.
- Learners (Assessment Participants) belong to one or more cohorts; cohorts are the unit for scheduling assessments and aggregating analytics.
- Reviewers/Raters resolve deferred scoring events (`FreeResponseEvaluationRequested`, `ScenarioEvaluationRequested`). Proctors/Operations unlock attempts and monitor live sessions. Analytics Consumers query reporting endpoints. The Rater API role is spelled `RATER` and exposed to clients via `GET /users/roles`.

## Database & Tooling

- SQLite schema lives under `migrations/sqlite/`. Run `npm run db:migrate -- --tenant=<id>` (or `--all-tenants`) whenever migrations change—`013_users_table.sql` adds the `users` table required by the new user routes. Local files are stored under `data/sqlite/{tenantId}.db`.
- Seeding utilities are in `scripts/sqlite/`. Use `npm run db:reset -- --tenant=<id>` for deterministic sample data or `npm run db:seed:random-data -- --tenant=<id> --items=12 --assessments=4 --attempts=10 [--append]` for randomized math drills across items/assessments/attempts.
- Repository helpers (`insertItem`, etc.) encapsulate SQL statements; reuse them from scripts to avoid drift.

## Testing & Workflows

- Tests use Vitest; `npm test` runs the full suite (unit + route tests). Route tests mock Fastify, repositories, and event bus calls—mirror this approach when adding coverage.
- Dev server runs via `npm run dev` (tsx watch). All Fastify plugins must remain registration-safe (no `await import` inside handlers) to support hot reloads.
- Logging uses `pino` with Fastify’s logger; when adding new routes, prefer `request.log` over `console.log`.

## Conventions

- Use dependency-injected repositories and avoid importing concrete implementations inside modules (other than top-level wiring in `src/app.ts`).
- Keep migrations idempotent, sorted numerically, and ensure inserts/updates happen without manual BEGIN/COMMIT (sql.js auto-wraps statements). When adding new item shapes, include schema/storage guidance for choice JSON plus the shape-specific columns (`blank_schema_json`, `matching_schema_json`, `ordering_schema_json`, `short_answer_schema_json`, `essay_schema_json`, `numeric_schema_json`, `hotspot_schema_json`, `drag_drop_schema_json`, `scenario_schema_json`).
- Random seeding (`scripts/sqlite/seed-random-data.ts`) must continue generating every item kind (including hotspot, drag-and-drop, and scenario tasks) so analytics/tests have coverage; update attempt mocks/scoring logic in tandem when introducing new response formats or deferred-scoring workflows (scenario tasks emit `ScenarioEvaluationRequested`).
- When extending API surface, update both route tests, type definitions, and seed scripts to keep tooling (CLI + default data) aligned. User management endpoints (`/tenants/:id/admins`, `/users`) must also update `src/common/types.ts`, repository bundles, and seeding/CLI utilities when fields change.
- When extending API surface, update both route tests, type definitions, and seed scripts to keep tooling (CLI + default data) aligned. User management endpoints (`/tenants/:id/admins`, `/users`, `GET /users/roles`) must also update `src/common/types.ts`, repository bundles, and seeding/CLI utilities when fields change. Fetch the authoritative tenant-manageable roles from `TENANT_USER_ROLES` rather than duplicating literals, and remember that the SQLite schema now persists multi-role assignments via `roles_json`.
- Any new tenant-scoped functionality should accept `{ tenantId, ... }` and be tested with mock tenant headers just like existing modules.
