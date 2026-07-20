# VelcozSharp Architecture

> Project overview and technical architecture for contributors and AI agents.
> Last updated: 2026-07-13 (OpenRouter AI integration added; SignalR real-time notifications; planning docs in `planning/` — local only, not committed)

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
| Backend | C# 10, ASP.NET Core, EF Core, PostgreSQL, SignalR |
| Auth | ASP.NET Core Identity (cookie-based) |
| Frontend | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, @microsoft/signalr |
| Database | PostgreSQL with JSONB for dynamic asset properties |
| External APIs | NVD API v2 (CVE data), OpenRouter (AI) |
| AI / LLM | OpenRouter API — relevance scoring + mitigation suggestions |
| Hosting | Local dev: `dotnet run` + `npm run dev` |

---

## Backend Architecture

### Project Layout

```
backend/
  Controllers/        API endpoints (one per domain)
  Data/               AppDbContext, migrations
  Hubs/               SignalR hubs for real-time notifications
  Models/             Entities, Enums, DTOs
  Services/           Business logic (scanning, validation, audit, notifications)
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
| `ScanScheduleController` | CRUD for recurring scan schedules |
| `NotificationsController` | In-app notifications: list, mark read, test |
| `AuditLogsController` | Read audit trail |

### Key Services

| Service | Responsibility |
|---------|----------------|
| `BackgroundScanWorker` | `IHostedService` that processes queued `ScanJob` records |
| `RegexCveMappingService` | Extracts keywords from asset properties, queries NVD, filters results by regex relevance |
| `NvdApiService` | HTTP client for NVD API with rate limiting |
| `OpenRouterService` | Server-side OpenRouter client for CVE relevance scoring and mitigation suggestions |
| `AuditLogService` | Writes `AuditLog` records for mutations |
| `AssetValidationService` | Validates asset properties against asset type schema |
| `AssetTypeTemplateService` | Seeds built-in asset type templates per org |
| `NotificationService` | Creates notifications and broadcasts via SignalR |
| `NotificationHub` | SignalR hub; clients join org groups to receive push notifications |

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
  ├── AiSuggestedMitigation (nullable)
  └── AssetVulnerabilities

AssetVulnerability
  ├── AssetId
  ├── VulnerabilityId
  ├── Status (Active/Acknowledged/False Positive/Mitigated)
  ├── DetectedAt
  ├── MatchedKeyword
  └── AiRelevanceScore (nullable, 0–100)

ScanJob
  ├── OrganizationId
  ├── Type (Single/Bulk/All)
  ├── Status (Queued/Running/Completed/Failed)
  ├── TargetAssetIds
  ├── TotalAssets
  ├── ProcessedAssets
  ├── CurrentAssetName
  └── NewVulnerabilitiesFound

Notification
  ├── OrganizationId
  ├── UserId (null = org-wide)
  ├── Type (CriticalVulnerabilityFound, ScanCompleted, ScanFailed, ScheduleFailed)
  ├── Title
  ├── Message
  ├── Link
  ├── IsRead
  └── CreatedAt

RecurringScanConfig
  ├── OrganizationId
  ├── Name
  ├── CronExpression
  ├── Scope (All/Bulk/Single)
  ├── TargetAssetIds (for Bulk scope)
  ├── Enabled
  ├── LastRunAt
  └── CreatedAt/UpdatedAt

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
5. `NotificationService` creates a notification and broadcasts it to the org's SignalR group.

### Real-Time Notifications

- Frontend opens a SignalR connection to `/hubs/notifications` after login.
- Connection joins the current org group (`JoinOrganization`).
- Server pushes `NewNotification` messages for scan completion, failures, and critical CVEs.
- `ToastProvider` displays a toast; the bell and `/notifications` page refresh via a custom event.

### Frontend Polling

- `JobContext` polls `GET /api/scan/jobs` every 3 seconds when jobs are active, otherwise every 10 seconds.
- Dashboard and `/cve-mapping` use `useJobs()` to show live scan status.
- Notification bell falls back to polling every 30 seconds if the SignalR connection is not active.

---

## Frontend Architecture

### Project Layout

```
frontend/src/
  app/                Next.js app router pages
  components/ui/      shadcn/ui components
  components/         Custom components (navbar, notification-bell)
  lib/
    api.tsx           OrgContext, useApiFetch, useAuthSession, useDebounce
    jobs.tsx          JobContext, useJobs
    signalr.tsx       SignalR connection, real-time notification handler
    toast.tsx         Toast context + container
    utils.ts          cn() helper
```

### State Management

- **Org state:** `OrgContext` stores current org ID and org list. Replaces the earlier localStorage hack.
- **Job state:** `JobContext` polls scan jobs globally so any page can show progress.
- **Toast state:** `ToastProvider` displays ephemeral toast notifications.
- **Real-time state:** `SignalRProvider` manages the WebSocket connection and dispatches notifications.
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

### Notifications
- `GET /api/notifications` — paginated list (unread first)
- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/{id}/read`
- `POST /api/notifications/mark-all-read`
- `POST /api/notifications/test`

### Real-Time
- SignalR hub at `/hubs/notifications`
- `JoinOrganization(string organizationId)` / `LeaveOrganization(string organizationId)`
- Server event: `NewNotification`

### Scan Schedules
- `GET/POST /api/scan-schedules`
- `GET /api/scan-schedules/{id}`
- `PATCH/DELETE /api/scan-schedules/{id}`

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

## OpenRouter / AI Integration

> **Status: Designed but NOT yet implemented.** This is the #1 post-MVP feature.
> The architecture below describes the intended design. The service files, DB fields, and UI badges do not exist yet.

VelcozSharp will use the **OpenRouter API** from the backend to enhance vulnerability triage. AI calls are server-side only; the API key never reaches the frontend.

### Use Cases

1. **CVE Relevance Scoring**
   - After `RegexCveMappingService` returns candidate CVEs from NVD, `OpenRouterService` scores each candidate 0–100 for relevance to the specific asset.
   - The score is stored on `AssetVulnerability.AiRelevanceScore`.
   - The UI defaults to showing matches above a configurable threshold, reducing false positives from keyword-only search.

2. **Mitigation Suggestions**
   - For linked CVEs, `OpenRouterService` suggests patch, upgrade, or workaround steps.
   - Suggestions are stored on `Vulnerability.AiSuggestedMitigation`.
   - The UI labels them as **"AI Suggested (unverified)"** and requires a human to confirm any status change to `Mitigated`.

### Safety Guardrails

- AI never creates or deletes vulnerability records.
- AI never changes `AssetVulnerability.Status` directly.
- All AI suggestions are logged in the audit trail alongside the human decision.
- The `Organization.IsAiEnabled` flag controls whether AI features are active per organization.

### Configuration

- **Development:** OpenRouter API key stored in `backend/appsettings.Development.json` or user secrets (`dotnet user-secrets`).
- **Production:** Key injected via environment variable or Azure Key Vault.

### Service Placement

- `OpenRouterService` will live in `backend/Services/` and be called by `RegexCveMappingService` and `AssetsController`.
- Prompts will be version-controlled in `backend/Services/Ai/Prompts/`.

---

## Out of Scope (Post-MVP — Skip These)

The following are explicitly **not planned** for VelcozSharp. They add complexity with low portfolio ROI for a student learning project.

| Feature | Why Skipped |
|---------|-------------|
| Database cleanup / TTL / auto-purge | Security app — all data retained for audit trail integrity |
| SMS notifications | Overkill for portfolio |
| Mobile push notifications | Way out of scope |
| Advanced RBAC beyond Admin/SecurityAnalyst/Viewer | 3 roles sufficient for MVP |
| Multi-instance scaling / K8s / Terraform | Not running production scale |
| Table partitioning / pg_cron / DB-level archiving | Unnecessary without millions of rows |
| Dashboard widgets / customization | Polishing, not differentiating |
| Org Settings & User Preferences | Polishing, not differentiating |

## Post-MVP Overengineering Roadmap

The following are **designed but not yet built**. These are the "impressive but not essential" features that turn VelcozSharp into a portfolio centerpiece. Build them slowly, one at a time, after MVP is complete.

| Priority | Feature | What It Demonstrates |
|----------|---------|---------------------|
| **#1** | **OpenRouter AI Integration** — CVE relevance scoring + mitigation suggestions | AI integration, prompt engineering |
| **#2** | **Charts & Data Viz Dashboard** — Recharts/Tremor donut, bar, line charts | Polished UX, data visualization |
| **#3** | **CI/CD + Containerization + Cloud Deploy** — Dockerfile, GitHub Actions, Render/Azure | DevOps maturity, production deployment |
| **#4** | **CISA KEV + EPSS Enrichment** — actively exploited CVEs + exploit probability | Deep security domain expertise |
| **#5** | **API Tokens + Webhook Integrations** — scoped keys, outgoing webhooks with retry | Platform thinking, SaaS architecture |
| **#6** | **Redis Caching Layer** — dashboard stats, NVD results, asset pages | Performance engineering, distributed systems |

Full details, effort estimates, and implementation notes for each are tracked in [`planning/FUTURE-IMPROVEMENTS.md`](./planning/FUTURE-IMPROVEMENTS.md) (local only, not committed).
