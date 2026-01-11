# Analytics Evolution

MVP (Iteration 0): synchronous aggregation by scanning existing attempts/items/cohorts.

## Access control

- Allowed roles: `TENANT_ADMIN`, `CONTENT_AUTHOR`
- Explicitly forbidden: `SUPER_ADMIN` (even when sending tenant headers)

## MVP endpoints

All endpoints are tenant-scoped and require auth headers per the headless API.

### Assessment rollups

- `GET /analytics/assessments/:id`
	- Legacy: returns `{ attemptCount, averageScore }` for *scored* attempts.

- `GET /analytics/assessments/:id/summary`
	- Returns distribution + pass rate + completion-time approximations.
	- Query params:
		- `passThreshold` (0..1, default `0.7`)
		- `bucketSize` (0.01..0.5, default `0.1`)

- `GET /analytics/assessments/:id/funnel`
	- Participation funnel derived from cohort assignments + attempts:
		- assigned learners
		- started learners (attempt exists)
		- submitted learners
		- scored learners

- `GET /analytics/assessments/:id/attempts-usage`
	- Attempts used vs allowed (aggregate only).
	- Uses the most-permissive `allowedAttempts` across cohort assignments, falling back to `assessment.allowedAttempts`.

### Item rollups

- `GET /analytics/assessments/:id/items/most-missed`
	- Returns items ordered by lowest perfect rate.
	- Query params:
		- `limit` (1..50, default `10`)
	- Note: only includes item kinds that can be auto-scored with current scoring helpers.

## Future direction

Project AttemptScored events into a dedicated read model (Cosmos DB) keyed by `tenantId#assessmentId#dateBucket` to support fast time-sliced analytics and avoid scanning large attempt histories.
