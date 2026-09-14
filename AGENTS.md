# AGENTS.md

Guidance for AI coding agents working in this repo.

VelcozSharp is a multi-tenant asset & vulnerability management platform: organizations register assets (servers, laptops, databases), scan them against the NVD, and triage the matching CVEs. Personal learning/portfolio project — bias toward simple, readable implementations over enterprise plumbing.

For deep architecture context (entity graph, scan pipeline, design decisions, API reference), read `ARCHITECTURE.md` — it is the committed source of truth and mostly current. The `planning/` directory is **gitignored, local-only** working docs (roadmap, API contract, security notes).

## Repo layout

```
backend/    ASP.NET Core API (.NET 10, EF Core, Identity, SignalR) — no .sln; run dotnet from backend/
frontend/   Next.js 16 App Router (React 19, Tailwind v4, shadcn/ui on Base UI) — pnpm workspace member
planning/   Local-only planning docs (gitignored)
```

## Commands

All orchestration is from the repo root via **pnpm** (never npm/yarn — `pnpm-lock.yaml` files, `pnpm-workspace.yaml`).

```bash
pnpm setup            # install, dotnet restore, start postgres, apply migrations
pnpm dev              # postgres + backend + frontend concurrently (kills ports first)
pnpm db:migrate       # apply EF migrations
pnpm db:reset         # drop + re-create the database
pnpm db:seed          # (DevSeeder also runs automatically on backend startup in Development)
```

Individually: `pnpm dev:backend` (backend on **:5038**), `pnpm dev:frontend` (frontend on **:3000**), `pnpm db:up` / `db:logs` / `db:down`, pgAdmin on **:5050**. Postgres is exposed on host port **5433** (not 5432).

## Verifying changes

There is **no test suite** on either side. Verification is:

```bash
cd backend  && dotnet build          # must be 0 errors (a few pre-existing warnings are OK)
cd frontend && pnpm build            # must succeed
```

`cd frontend && pnpm lint` currently **fails on main** with ~90 pre-existing errors (`no-explicit-any`, `no-unused-vars`, `react-hooks/*`). Treat that as the baseline: do not introduce new violations, but do not "fix" unrelated lint errors in unrelated changes either.

## Non-negotiables

- **Multi-tenancy is enforced by EF query filters.** `AppDbContext.CurrentOrganizationId` drives global query filters on all tenant entities. Controllers set it via `TenantControllerBase.GetCurrentOrgIdAsync()` (reads the `X-Organization-Id` header, validates membership). If you query a filtered entity without setting it, queries **silently return empty** — this is the #1 trap. Background jobs (`BackgroundScanWorker`) deliberately use `IgnoreQueryFilters()` + explicit `OrganizationId` predicates; do the same in any new out-of-band code.
- **Every new tenant-scoped entity needs**: an `OrganizationId` column, a global query filter in `AppDbContext`, and DTOs that never leak another org's data.
- **Enums cross the API as strings** (`JsonStringEnumConverter`). Frontend types must use the string names.
- **Postgres specifics**: `Asset.Properties` is `jsonb`, `ScanJob.TargetAssetIds` is `uuid[]` — this is why `Program.cs` builds an `NpgsqlDataSourceBuilder` with `EnableDynamicJson()`. Don't replace it with plain `UseNpgsql()`.
- **Secrets**: `OpenRouter:ApiKey` lives in `dotnet user-secrets` (never in appsettings). NVD API keys are per-organization, stored in the DB. AI calls are backend-only.
- **AI prompts** live in `backend/Prompts/*.txt` as embedded resources, loaded by name via `AiPrompts.cs` — renaming a file breaks loading lazily at first use.

## Backend conventions

- Controllers: `[ApiController]`, route `api/[controller]`. Tenant controllers extend `TenantControllerBase`; only `PlatformController` is platform-scoped (`[Authorize(Roles = RoleNames.PlatformAdmin)]`).
- **Two role systems** (don't conflate): ASP.NET Identity roles (only `PlatformAdmin` is checked via attributes) and org-scoped roles (`UserOrganization.Role`: `Admin`, `SecurityAnalyst`, `Viewer` — strings, checked imperatively). Pattern: `var auth = await RequireOrgRoleAsync(RoleNames.Admin, RoleNames.SecurityAnalyst); if (auth != null) return auth;`. Reads = any org member; writes = Admin/SecurityAnalyst unless it's org config (Admin only). Platform admins act as org Admin everywhere. A missing/invalid `X-Organization-Id` yields **403**, not 401.
- **No AutoMapper.** Map manually — extension methods (`ToResponse()`) or inline EF projections; follow the neighboring actions.
- Mutations should write an audit record via `IAuditLogService` and, where the user cares, a notification via `INotificationService` (persist + SignalR broadcast in one call).
- New migration: `cd backend && dotnet ef migrations add <PascalCaseName> --context AppDbContext`. Migrations are append-only history; never edit applied ones.
- Errors: return explicit 400/403/404 with `{ message }`; unhandled exceptions funnel through `ExceptionHandlingMiddleware` (500 + traceId).
- Soft-delete convention: orgs get `IsActive = false`; `Decommissioned` assets are excluded from lists.

## Frontend conventions

- **This is Next.js 16 — not the Next.js in your training data.** Before writing frontend code, check `frontend/node_modules/next/dist/docs/` (see `frontend/AGENTS.md`). Notably, middleware is `src/proxy.ts` exporting `proxy()` — there is no `middleware.ts`.
- **Route access has a single source of truth**: `ROUTE_ROLES` in `src/lib/route-roles.ts`, consumed by `proxy.ts` (server-side guard via the `velcoz_org` cookie, format `"${orgId}:${role}"`) and mirrored by `src/lib/nav.tsx` for sidebar filtering. A new role-restricted page must be added there and to nav; dev-only pages must be wrapped in `DevGate`.
- Guarding is layered: `proxy.ts` (server) → layout guards (`AuthGuard`, `PlatformAdminGuard`, `PublicAuthGuard`) → `RouteGuard` per page. Keep all three consistent.
- **API types are hand-written and co-located** per page/component, mirroring backend DTOs. A backend DTO change must be mirrored manually — check callers when you change a DTO.
- Use the sanctioned paths: `useApiFetch()` (injects `X-Organization-Id` + credentials, 401 → login redirect) and `useToast()`. Backend base URL: `NEXT_PUBLIC_API_URL`, default `http://localhost:5038/api`.
- Real-time: SignalR hub `/hubs/notifications` + a window-event bus (`velcoz:notification`, `velcoz:scan-progress`, `velcoz:job-changed` dispatched from `src/lib/signalr.tsx`). Listen to those events instead of adding new polling; `JobContext` already handles job polling (adaptive interval).
- UI: shadcn/ui components are built on **Base UI, not Radix**. Use `PageHeader` for page headers, the composite skeletons in `src/components/skeletons.tsx` for loading states, and severity helpers from `src/lib/severity.tsx`. Brand color is the indigo `primary`/`accent`/`sidebar-*` theme tokens in `globals.css` — don't hardcode hexes; dark mode must keep working (custom `ThemeProvider`, `velcoz-theme` localStorage key, FOUC script in root layout).

## Workflow notes

- Commits follow Conventional Commits with scopes: `feat(backend): …`, `fix(frontend): …`, `refactor: …`.
- `pnpm dev` kills ports 5038/3000 on start; to free them manually: `npx kill-port 5038 3000`.
- Dev-only seeding: `DevSeeder` runs at backend startup in Development only (demo orgs + users, e.g. `admin@test.com`/`password123`, platform admin `host@velcozsharp.local`). Note `POST /api/seed/demo-assets` (`SeedController`) is **not** env-gated — it's live wherever deployed, gated only by org Admin auth.
- Docs drift happens: README says "C# 10" but the target is .NET 10; `ARCHITECTURE.md` "Development Commands" says npm but the repo is pnpm. Trust the code and this file; fix stale docs when you touch the relevant area.
