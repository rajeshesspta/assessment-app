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
npm run dev
```

Server listens on `http://127.0.0.1:3000` by default.

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
