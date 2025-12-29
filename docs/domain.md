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
   - Authenticates with the tenant API key (`x-tenant-id=<tenantId>`), rotates keys as needed, and manages rate limits/feature flags.
   - Calls `POST /users` to invite Content Authors, Learners, or Raters (payload supplies `roles[]`). Duplicate emails per tenant return `409`.
   - Creates cohorts via `POST /cohorts` (requires at least one learner id and validates each referenced user includes the `LEARNER` role) and attaches assessments with `POST /cohorts/:id/assessments` as content becomes available.
3. **Content Author workflow**
   - Uses `/items` to author the shared question bank.
   - Builds assessments with `/assessments`, setting `allowedAttempts` (defaults to `1`) for every learner that launches the assessment.
   - Partners with Tenant Admins (or uses their own `CONTENT_AUTHOR` credentials) to map assessments to cohorts so assignments propagate automatically.
4. **Learner workflow**
   - Launches attempts with `POST /attempts`. The handler enforces learner existence/role, cohort membership for the requested assessment, and the `allowedAttempts` limit before persisting a new attempt.
   - Uses PATCH/submit endpoints to store responses; analytics surfaces completion metrics per assessment.

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

| Column                                   | Notes                                                                |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `id`, `tenant_id`, `name`, `description` | Core metadata for the cohort.                                        |
| `learner_ids_json`                       | Array of learner ids; every id must reference a user with `LEARNER`. |
| `assessment_ids_json`                    | Array of assessment ids assigned to the cohort.                      |
| `created_at` / `updated_at`              | ISO timestamps (Fastify model helper sets these fields on save).     |

Learners inherit access to any assessment listed in the cohort’s `assessmentIds`. The repository implementation persists both arrays as JSON for SQLite and memory providers.

### Assessments & Assignments

- `assessments` now include an `allowed_attempts` column (default `1`) persisted via migration `016_assessment_attempt_limits.sql`.
- Attempt creation (`POST /attempts`) queries existing attempts scoped by `{ tenantId, assessmentId, learnerId }` and blocks new records once `allowedAttempts` is exhausted.
- Cohort repositories store which assessments a cohort can access; learners must belong to at least one cohort that contains the requested assessment.

### APIs

| Endpoint                                          | Description                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /tenants`                                   | Super Admin only; creates tenant + bootstrap API key.                                       |
| `POST /tenants/:id/admins`                        | Super Admin invites tenant admins while impersonating the tenant scope.                     |
| `POST /users`                                     | Tenant Admin creates Content Authors, Learners, or Raters (non-empty `roles[]` required).   |
| `POST /cohorts` / `POST /cohorts/:id/assessments` | Tenant Admin or Content Author manages cohorts and assigns assessments.                     |
| `POST /assessments`                               | Content Author creates assessments and sets the tenant-wide `allowedAttempts` value.        |
| `POST /attempts`                                  | Validates learner record, cohort membership, and `allowedAttempts` before starting attempt. |

The `users` table is now implemented via migration `013_users_table.sql`, and corresponding routes (`POST /tenants/:id/admins`, `POST /users`) persist real user records for tenant administration and invitations. Apply the migration (e.g., `npm run db:migrate -- --all-tenants`) before calling the new APIs in existing environments.

## Extensible Item Model & Tenant Taxonomy

Items support tenant-configurable taxonomy fields for categorization and metadata:

- **Categories**: Multi-select from a tenant-defined list (e.g., "Math", "Science").
- **Tags**: Multi-select from a tenant-defined list (e.g., "Easy", "Advanced").
- **Metadata**: Custom fields defined per tenant, supporting string, number, boolean, enum, array, or object types.

### Taxonomy Configuration

Tenant taxonomy is configured in the Control Plane and exposed via the tenant config bundle. Example:

```json
{
  "taxonomy": {
    "categories": ["Math", "Science", "History"],
    "tags": ["Easy", "Medium", "Hard"],
    "metadataFields": [
      {
        "key": "difficulty",
        "label": "Difficulty Level",
        "type": "enum",
        "required": false,
        "allowedValues": ["Beginner", "Intermediate", "Advanced"]
      },
      {
        "key": "skills",
        "label": "Required Skills",
        "type": "array",
        "required": true
      }
    ]
  }
}
```

### Item API Extensions

- `POST /items` and `PATCH /items/:id` accept `categories[]`, `tags[]`, and `metadata` object.
- `GET /items` supports filtering: `?categories=Math&tags=Easy&metadata[difficulty]=Beginner`.
- Analytics endpoints: `GET /analytics/items/by-category`, `GET /analytics/items/by-tag` for reporting.

### UI Behavior

Item creation/edit forms dynamically show taxonomy fields based on the tenant config. Fields are hidden if not configured, ensuring a clean interface for tenants without custom taxonomy.

## Taxonomy Configuration

Tenant Admins can configure the taxonomy fields (categories, tags, metadata) for their tenant to customize how items are categorized and filtered.

### Workflow

1. **Access Configuration**: Tenant Admins navigate to the "Taxonomy Config" page in the portal.
2. **Define Fields**: Configure the structure of categories and tags fields (type, required, description).
3. **Add Metadata**: Define additional metadata fields with types and validation rules.
4. **Save Changes**: Update the configuration, which takes effect immediately for new item creation.
5. **Migration**: Existing items remain valid; the UI adapts to show/hide fields based on the new config.

### API Endpoints

- `GET /api/config/taxonomy`: Retrieve current taxonomy configuration.
- `PUT /api/config/taxonomy`: Update taxonomy configuration (Tenant Admin only).

### Validation

Changes to taxonomy config are validated to ensure they don't break existing functionality. For example, removing required fields or changing types may be restricted if items already use them.
