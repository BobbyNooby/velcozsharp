# VelcozSharp

> An asset and vulnerability management platform that watches your infrastructure, maps devices to known CVEs, and scores risk so you know what to patch first.
>
> Built to learn C# / ASP.NET Core and prove full-stack enterprise capability.

## Stack

| Layer | Tech |
|---|---|
| **Backend** | C# 10, ASP.NET Core, Entity Framework Core |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui |
| **Real-time** | SignalR |
| **Database** | PostgreSQL 17 with JSONB |
| **External APIs** | NVD API v2 (CVE data), OpenRouter (AI) |
| **DevOps** | Docker, Docker Compose, GitHub Actions CI/CD |
| **Deployment** | Azure App Service (or Render) |

## Features

- **Asset registry** — Track laptops, servers, phones, routers with department ownership
- **CVE auto-mapping** — Pull real vulnerability data from the NVD (National Vulnerability Database) API
- **CVSS risk scoring** — Calculate severity (Critical / High / Medium / Low) per device and per department
- **Role-based access control** — Admin, Security Analyst, and Viewer roles with cookie-based ASP.NET Core Identity
- **Audit trail** — Immutable before/after logs for every change, capturing who did what and when
- **AI-assisted CVE relevance scoring** — OpenRouter ranks NVD results to reduce false positives
- **AI-suggested mitigations** — OpenRouter recommends patch/update steps (human-verified before action)
- **Risk dashboard** — Real-time stats showing exposure by severity, department, and asset type
- **Export** — Generate CSV and JSON security reports for leadership
