# Copilot Instructions

## Architecture & Patterns

- Fastify + TypeScript (native ESM) app rooted in `src/`; `buildApp` wires auth, tenant routing, and per-module routes (`src/modules/**`). Each module exposes `*.routes.ts`, repositories, and tests in `__tests__`.
- Persistence is abstracted behind repository bundles. Default provider is SQLite via `sql.js` (see `src/infrastructure/sqlite/**`), but memory and Cosmos implementations exist; do not instantiate databases directly—inject the appropriate repository through options.
- Multi-tenant enforcement relies on the `x-tenant-id` header and repositories expect the tenant id as their first parameter. Always preserve this signature when adding repository APIs.
- Validation consistently uses `zod` schemas near route handlers. Follow the pattern in `src/modules/items/item.routes.ts` and `src/modules/attempts/attempt.routes.ts` when introducing new endpoints.
- Domain entities live in `src/common/types.ts`. Items now form a discriminated union: choice-based (`kind: 'MCQ' | 'TRUE_FALSE'`) with `answerMode`/`correctIndexes`, fill-in-the-blank (`kind: 'FILL_IN_THE_BLANK'`) with `blanks[]` + matcher metadata and `scoring.mode ('all' | 'partial')`, matching (`kind: 'MATCHING'`) with `prompts[]`, `targets[]`, and scoring rules, ordering (`kind: 'ORDERING'`) with `options[]`, `correctOrder[]`, and `scoring.mode ('all' | 'partial_pairs' | custom evaluator)`, and short-answer (`kind: 'SHORT_ANSWER'`) with optional rubric keywords/guidance plus `scoring.mode ('manual' | 'ai_rubric')` and `maxScore`. Attempts capture `answerIndexes`, `textAnswers`, `matchingAnswers`, and `orderingAnswer`; keep these shapes in sync with persistence + repositories.

## Database & Tooling

- SQLite schema lives under `migrations/sqlite/`. Run `npm run db:migrate -- --tenant=<id>` (or `--all-tenants`) whenever migrations change. Local files are stored under `data/sqlite/{tenantId}.db`.
- Seeding utilities are in `scripts/sqlite/`. Use `npm run db:reset -- --tenant=<id>` for deterministic sample data or `npm run db:seed:random-data -- --tenant=<id> --items=12 --assessments=4 --attempts=10 [--append]` for randomized math drills across items/assessments/attempts.
- Repository helpers (`insertItem`, etc.) encapsulate SQL statements; reuse them from scripts to avoid drift.

## Testing & Workflows

- Tests use Vitest; `npm test` runs the full suite (unit + route tests). Route tests mock Fastify, repositories, and event bus calls—mirror this approach when adding coverage.
- Dev server runs via `npm run dev` (tsx watch). All Fastify plugins must remain registration-safe (no `await import` inside handlers) to support hot reloads.
- Logging uses `pino` with Fastify’s logger; when adding new routes, prefer `request.log` over `console.log`.

## Conventions

- Use dependency-injected repositories and avoid importing concrete implementations inside modules (other than top-level wiring in `src/app.ts`).
- Keep migrations idempotent, sorted numerically, and ensure inserts/updates happen without manual BEGIN/COMMIT (sql.js auto-wraps statements). When adding new item shapes, include schema/storage guidance for choice JSON plus the shape-specific columns (`blank_schema_json`, `matching_schema_json`, `ordering_schema_json`, `short_answer_schema_json`).
- Random seeding (`scripts/sqlite/seed-random-data.ts`) must continue generating every item kind so analytics/tests have coverage; update attempt mocks/scoring logic in tandem when introducing new response formats.
- When extending API surface, update both route tests, type definitions, and seed scripts to keep tooling (CLI + default data) aligned.
- Any new tenant-scoped functionality should accept `{ tenantId, ... }` and be tested with mock tenant headers just like existing modules.
