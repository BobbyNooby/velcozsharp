# VelcozSharp Architecture

> Project overview and technical architecture for contributors and AI agents.
> Last updated: 2026-07-10

---

## What Is VelcozSharp?

VelcozSharp is a multi-tenant asset and vulnerability management system. A single deployed instance serves multiple organizations. Each organization manages its own assets (servers, laptops, software, databases, etc.) and scans them against the NVD (National Vulnerability Database) to find matching CVEs.

**Core use case:**
1. Create an organization.
2. Define asset types (e.g., Server, Laptop, Database) with dynamic properties.
3. Add assets with property values (OS, version, vendor, etc.).
4. Run CVE scans — the system queries NVD and links relevant CVEs to assets.
5. Triage CVEs (Active, Acknowledged, False Positive, Mitigated).
6. Review dashboard stats, audit logs, and scan history.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | C# 10, ASP.NET Core, EF Core, PostgreSQL |
| Auth | ASP.NET Core Identity (cookie-based) |
| Frontend | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui |
| Database | PostgreSQL with JSONB for dynamic asset properties |
| External API | NVD API v2 (CVE data) |
| Hosting | Local dev: `dotnet run` + `npm run dev` |

---

## Backend Architecture

### Project Layout

```
backend/
  Controllers/        API endpoints (one per domain)
  Data/               AppDbContext, migrations
  Models/             Entities, Enums, DTOs
  Services/           Business logic (scanning, validation, audit)
  Program.cs          DI registration, middleware pipeline
```

### Multi-Tenancy

- One user can belong to many organizations via `UserOrganization`.
- Every request sends `X-Organization-Id` header from the frontend.
- `TenantControllerBase` validates the user is a member of that org on every request.
- `AppDbContext` applies a global query filter `OrganizationId == CurrentOrganizationId` to all tenant-scoped entities.

### Controllers

| Controller | Responsibility |
|------------|----------------|
| `AuthController` | Login, logout, register, current user |
| `OrganizationsController` | Org CRUD, member management |
| `DepartmentsController` | Department CRUD |
| `AssetTypesController` | Asset type schemas and fields |
| `AssetsController` | Asset CRUD + vulnerability status changes |
| `VulnerabilitiesController` | Org-wide CVE list + bulk status update |
| `ScanController` | Queue async scan jobs, read job status |
| `DashboardController` | Aggregate stats for homepage |
| `SeedController` | Demo data seeder |
| `AuditLogsController` | Read audit trail |

### Key Services

| Service | Responsibility |
|---------|----------------|
| `BackgroundScanWorker` | `IHostedService` that processes queued `ScanJob` records |
| `RegexCveMappingService` | Extracts keywords from asset properties, queries NVD, filters results by regex relevance |
| `NvdApiService` | HTTP client for NVD API with rate limiting |
| `AuditLogService` | Writes `AuditLog` records for mutations |
| `AssetValidationService` | Validates asset properties against asset type schema |
| `AssetTypeTemplateService` | Seeds built-in asset type templates per org |

---

## Database Models

### Core Entities

```
AppUser
  └── many-to-many ── UserOrganization ── many-to-many ── Organization

Organization
  ├── Departments
  ├── AssetTypeDefinitions
  ├── Assets
  ├── ScanJobs
  ├── AuditLogs
  └── UserOrganizations

AssetTypeDefinition
  └── Fields (AssetTypeField)

Asset
  ├── AssetType
  ├── Department
  ├── Properties (JSONB)
  └── Vulnerabilities (AssetVulnerability join)

Vulnerability
  ├── CveId (unique)
  ├── Description
  ├── CvssScore
  ├── Severity
  └── AssetVulnerabilities

AssetVulnerability
  ├── AssetId
  ├── VulnerabilityId
  ├── Status (Active/Acknowledged/False Positive/Mitigated)
  ├── DetectedAt
  └── MatchedKeyword

ScanJob
  ├── OrganizationId
  ├── Type (Single/Bulk/All)
  ├── Status (Queued/Running/Completed/Failed)
  ├── TargetAssetIds
  ├── TotalAssets
  ├── ProcessedAssets
  ├── CurrentAssetName
  └── NewVulnerabilitiesFound

AuditLog
  ├── OrganizationId
  ├── Action (AssetCreated, AssetUpdated, etc.)
  ├── EntityType
  ├── EntityId
  ├── BeforeJson
  ├── AfterJson
  └── ChangedByUserId
```

---

## Authentication Flow

1. User POSTs credentials to `/api/auth/login`.
2. ASP.NET Core Identity validates password and issues `velcoz_auth` cookie.
3. Frontend stores nothing — the browser sends the cookie with every request.
4. Frontend calls `/api/auth/me` on load to get user + org memberships.
5. Frontend picks a default org and sends `X-Organization-Id` on every API call.
6. Backend validates membership on every request via `TenantControllerBase`.

---

## CVE Scanning Flow

### Synchronous Part (API Request)

1. Frontend calls `POST /api/scan/assets/all`.
2. `ScanController` creates a `ScanJob` record with status `Queued`.
3. Controller returns `202 Accepted { jobId }` immediately.

### Asynchronous Part (Background Worker)

1. `BackgroundScanWorker` polls for `Queued` jobs every 3 seconds.
2. Picks the oldest queued job, marks it `Running`.
3. For each target asset:
   - Updates `CurrentAssetName`.
   - Calls `RegexCveMappingService.ScanAssetAsync(assetId, orgId)`.
   - `RegexCveMappingService` extracts keywords, calls NVD API, filters by regex, saves matches.
   - Increments `ProcessedAssets`.
4. Marks job `Completed` or `Failed` and stores total CVEs found.

### Frontend Polling

- `JobContext` polls `GET /api/scan/jobs` every 3 seconds when jobs are active, otherwise every 10 seconds.
- Dashboard and `/cve-mapping` use `useJobs()` to show live scan status.

---

## Frontend Architecture

### Project Layout

```
frontend/src/
  app/                Next.js app router pages
  components/ui/      shadcn/ui components
  lib/
    api.tsx           OrgContext, useApiFetch, useAuthSession, useDebounce
    jobs.tsx          JobContext, useJobs
    utils.ts          cn() helper
```

### State Management

- **Org state:** `OrgContext` stores current org ID and org list. Replaces the earlier localStorage hack.
- **Job state:** `JobContext` polls scan jobs globally so any page can show progress.
- **Page state:** Each page uses local `useState` for its own data.

### API Calls

- `useApiFetch()` returns a memoized `fetch` wrapper that injects:
  - `Content-Type: application/json`
  - `X-Organization-Id` header from context
  - `credentials: include` for cookies

---

## Key Design Decisions

### Why cookie auth instead of JWT?

Cookies are simpler for server-rendered frontend pages and avoid token storage issues. ASP.NET Core Identity handles sessions, password hashing, and claims.

### Why `X-Organization-Id` header instead of a session claim?

Per-request org selection is stateless, multi-tab friendly, and easier to debug. The real security boundary is the DB membership check on every request.

### Why async scan jobs?

NVD API calls are slow (6-second rate limit without API key). Scanning many assets synchronously would block HTTP requests for minutes. Background jobs keep the UI responsive and provide progress visibility.

### Why JSONB for asset properties?

Asset types have dynamic schemas. JSONB lets us store arbitrary property keys/values without migrating the database every time a new field is added.

### Why deduplicate CVEs in a separate `Vulnerability` table?

The same CVE (e.g., CVE-2024-XXXX) can affect many assets. Storing it once saves space and keeps CVE metadata consistent.

---

## API Endpoint Quick Reference

### Auth
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/register`
- `GET /api/auth/me`

### Organizations
- `GET /api/organizations`
- `POST /api/organizations`
- `GET/PUT/DELETE /api/organizations/{id}`

### Departments
- `GET /api/departments`
- `POST /api/departments`
- `PUT/DELETE /api/departments/{id}`

### Asset Types
- `GET /api/asset-types`
- `POST /api/asset-types`
- `GET/PUT/DELETE /api/asset-types/{id}`

### Assets
- `GET /api/assets` — supports filters, sort, pagination
- `POST /api/assets`
- `GET/PUT/DELETE /api/assets/{id}`
- `PATCH /api/assets/{id}/vulnerabilities/{vulnId}/status`

### Vulnerabilities
- `GET /api/vulnerabilities` — supports filters, sort, pagination
- `PATCH /api/vulnerabilities/bulk-status`

### Scanning
- `POST /api/scan/assets/{assetId}`
- `POST /api/scan/assets/bulk`
- `POST /api/scan/assets/all`
- `GET /api/scan/jobs`
- `GET /api/scan/jobs/{id}`

### Dashboard & Audit
- `GET /api/dashboard/stats`
- `GET /api/audit-logs`

### Seeding
- `POST /api/seed/demo-assets`

---

## Development Commands

```bash
# Backend
cd backend && dotnet run --urls "http://localhost:5038"

# Frontend
cd frontend && npm run dev

# Database migrations
cd backend && dotnet ef migrations add <Name> --context AppDbContext
cd backend && dotnet ef database update --context AppDbContext

# Kill stuck processes
npx kill-port 5038
npx kill-port 3000
```

---

## Out of Scope (For Now)

- AI-enhanced CVE filtering (`Organization.IsAiEnabled` exists but unused)
- Risk scoring formula (raw CVSS + severity + count is sufficient)
- Advanced RBAC beyond Admin/Member
- Multi-instance scaling
- CISA KEV / EPSS enrichment
- Email/SMS notifications

These are documented in `planning/WORKPLAN.md` and `planning/ROADMAP.md` for future reference.
