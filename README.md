# Assessment App (MVP)

Headless assessment platform MVP in TypeScript + Fastify.

## Modules (MVP)

- Auth (API key)
- Tenant enforcement (header `x-tenant-id`)
- Item Bank (MCQ only)
- Assessment Authoring (static list of item IDs)
- Attempt & Response Capture
- Scoring (auto for MCQ)
- Analytics (attempt count + average score)
- Event Bus (in-memory pub/sub)

## User Personas

- Assessment Admin: configures tenants, manages API keys, and oversees compliance controls.
- Content Author: builds and maintains item banks, assembles assessments, and tunes scoring rules.
- Candidate: launches attempts, records responses, and reviews feedback when released.
- Proctor/Reviewer: monitors live attempts, validates identity, and investigates flagged events.
- Analyst/Stakeholder: consumes analytics endpoints, tracks completion metrics, and reports outcomes to business leadership.

## Running

```powershell
npm install
npm test
npm run build
npm run dev
```

Server listens on `http://127.0.0.1:3000` by default.

## Configuration

- `COSMOS_ENDPOINT` / `COSMOS_KEY`: Cosmos DB account endpoint and key (defaults to local emulator).
- `COSMOS_DATABASE_ID`: Database name to host feature containers (default `assessment-app`).
- `COSMOS_API_KEYS_CONTAINER`: Container for API key records (default `api-keys`).
- `API_KEY_CACHE_TTL_MS`: Optional TTL for the in-memory API-key cache (default `60000`).
- `API_KEY` and `API_TENANT_ID`: Optional seed key for bootstrapping (useful for local dev).
- `DB_PROVIDER`: Selects the repository bundle (`memory` or `cosmos`, default `memory`).
- `.env.sample`: copy to `.env` for local configuration; values default to Cosmos DB Emulator + dev credentials.

When using the [Cosmos DB Emulator](https://learn.microsoft.com/azure/cosmos-db/emulator), keep the default endpoint `https://localhost:8081/` and key `C2y6yDjf5/R+ob0N8A7Cgv30VRDjEwef4zE3DUdh2PQ==`.

## Testing

- Unit and route coverage provided via [Vitest](https://vitest.dev/).
- `npm test` runs the full suite (auth middleware, items/assessments/attempts/analytics routes, scoring service, common utilities, config loader, Fastify bootstrap).
- `npx vitest run --coverage` generates `coverage/` reports (ignored by git).

## API (Summary)

- POST /items
- GET /items/:id
- POST /assessments
- GET /assessments/:id
- POST /attempts (start)
- PATCH /attempts/:id/responses (partial save)
- POST /attempts/:id/submit
- GET /attempts/:id
- GET /analytics/assessments/:id

Headers required: `x-api-key`, `x-tenant-id`.
