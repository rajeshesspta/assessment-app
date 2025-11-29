# Domain Overview

## Role Hierarchy

1. **Super Admin**
   - Platform-scoped identity that resides in the default system tenant (`sys-tenant`) but is treated as a member of every tenant for admin-only operations.
   - Provisions tenants, rotates global API keys, and monitors cross-tenant compliance while remaining limited to managing each tenant’s admins.
   - Seeds each tenant with at least one Tenant Admin via `POST /tenants/:id/admins` and maintains audit logs of tenant creation/deletion events.
2. **Tenant Admin**
   - Owns configuration for a specific tenant (API keys, rate limits, feature flags).
   - Creates Content Author and Learner users via `/users` APIs, manages cohort membership, and can edit items/assessments when needed.
3. **Content Author**
   - Creates new items or reuses any tenant-owned items (item bank is shared within the tenant boundary).
   - Builds assessments, sets maximum attempt counts, and assigns assessments to cohorts or individual learners.
4. **Learner (Assessment Participant)**
   - Receives assignments through cohorts or direct targeting and submits responses.
   - Each attempt is scoped uniquely by `{ tenantId, assessmentId, learnerId }` to enforce attempt limits and isolation.

## Provisioning & User Lifecycle

1. **Super Admin workflow**
   - Call `POST /tenants` (or CLI equivalent) with tenant metadata.
   - Authenticate using `x-tenant-id = SUPER_ADMIN_TENANT_ID` (default `sys-tenant`) and `x-api-key = SUPER_ADMIN_API_KEY`.
   - When managing tenant-level administrators, reuse the same API key but set `x-tenant-id` to the target tenant; the platform treats the Super Admin identity as a member of every tenant while constraining actions to tenant-admin management. Requests with mismatched `x-tenant-id` are rejected (HTTP 400) to avoid accidental cross-tenant admin creation.
   - Response returns tenant record plus bootstrap API key and invitation token for the first Tenant Admin.
   - Optional: specify `initialTenantAdmin` payload to auto-create that admin user; otherwise invoke `POST /tenants/:id/admins` after provisioning to invite additional tenant admins.
2. **Tenant Admin workflow**
   - Authenticates with tenant API key + `x-tenant-id`.
   - Calls `POST /users` to invite Content Authors or Learners (payload includes `role: 'CONTENT_AUTHOR' | 'LEARNER'`). Duplicate emails within the tenant return `409`.
   - Manages cohorts via `POST /cohorts`, `PATCH /cohorts/:id`, `POST /cohorts/:id/learners`.
3. **Content Author workflow**
   - Uses shared item bank endpoints (`/items`, `/assessments`) to create or reuse tenant-owned content.
   - Assigns assessments via `POST /assessments/:id/assignments` targeting `cohortId[]` or `learnerId[]` and sets `allowedAttempts`.
4. **Learner workflow**
   - Lists available assignments via `/assessments?assignedTo=me`.
   - Starts an attempt with `POST /attempts` (server validates assignment + remaining attempts) and submits via existing attempt routes.

## Data Model & API Hooks

### Users

| Column                      | Notes                                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `id` (string)               | User identifier (UUID).                                                                                    |
| `tenant_id` (string)        | Nullable for Super Admin; required otherwise.                                                              |
| `role` (enum)               | `SUPER_ADMIN`, `TENANT_ADMIN`, `CONTENT_AUTHOR`, `LEARNER`.                                                |
| `email` / `display_name`    | Contact metadata. Emails are stored lowercase and must be unique per tenant (`UNIQUE (tenant_id, email)`). |
| `status`                    | `active`, `invited`, `disabled`. Default is `invited` for new users.                                       |
| `created_at` / `updated_at` | ISO timestamps.                                                                                            |
| `created_by`                | User id of creator (Super Admin for tenant admins, tenant admin for lower roles).                          |

### Cohorts

| Column                                   | Notes                                   |
| ---------------------------------------- | --------------------------------------- |
| `id`, `tenant_id`, `name`, `description` |
| `created_by`                             | Tenant Admin or Content Author.         |
| `metadata_json`                          | Optional labels (program, track, etc.). |

`cohort_members` join table records `{ cohort_id, learner_id, tenant_id }`.

### Assessments & Assignments

- Extend `assessments` table with `allowed_attempts` (default `1`).
- New `assessment_assignments` table:
  - `id`, `assessment_id`, `tenant_id`, `target_type` (`cohort` | `learner`), `target_id`, `assigned_by`, `assigned_at`.
  - Derived learner-specific entries (materialized or on-the-fly) ensure attempt limits per learner.

### APIs

| Endpoint                               | Description                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `POST /tenants`                        | Super Admin only; creates tenant + bootstrap admin.                                                                             |
| `POST /tenants/:id/admins`             | Super Admin adds additional tenant admins.                                                                                      |
| `POST /users`                          | Tenant Admin creates content authors or learners.                                                                               |
| `POST /cohorts` / `PATCH /cohorts/:id` | Tenant Admin or Content Author manages cohorts.                                                                                 |
| `POST /assessments/:id/assignments`    | Content Author assigns to `cohortIds[]` or `learnerIds[]`, sets `allowedAttempts` per assignment (overrides default if needed). |
| `POST /attempts`                       | Validates learner assignment + remaining attempts before creating attempt record.                                               |

The `users` table is now implemented via migration `013_users_table.sql`, and corresponding routes (`POST /tenants/:id/admins`, `POST /users`) persist real user records for tenant administration and invitations. Apply the migration (e.g., `npm run db:migrate -- --all-tenants`) before calling the new APIs in existing environments.
