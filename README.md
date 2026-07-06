# VelcozSharp

> An asset and vulnerability management platform that watches your infrastructure, maps devices to known CVEs, and scores risk so you know what to patch first.
>
> Built to learn C# / ASP.NET Core and prove full-stack enterprise capability.

## Stack

| Layer | Tech |
|---|---|
| **Backend** | C# 12, ASP.NET Core 8, Entity Framework Core |
| **Frontend** | Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| **Database** | PostgreSQL 15 |
| **DevOps** | Docker, Docker Compose, GitHub Actions CI/CD |
| **Deployment** | Azure App Service (or Render) |

## Features

- **Asset registry** — Track laptops, servers, phones, routers with department ownership
- **CVE auto-mapping** — Pull real vulnerability data from the NVD (National Vulnerability Database) API
- **CVSS risk scoring** — Calculate severity (Critical / High / Medium / Low) per device and per department
- **Role-based access control** — Admin, Security Analyst, and Viewer roles with JWT authentication
- **Audit trail** — Immutable before/after logs for every change, capturing who did what and when
- **Risk dashboard** — Real-time charts showing exposure by severity, department, and asset type
- **Export** — Generate CSV and PDF security reports for leadership
