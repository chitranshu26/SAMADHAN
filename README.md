# SAMADHAN

**Smart AICTE Monitoring & Action Dashboard for Higher-Ed Networks** is an
independent demonstration of a connected higher-education grievance management
platform. It provides a case lifecycle for complaints, investigations, reviews,
approvals, decisions, notifications, and complainant updates.

> **Demonstration only:** This project uses synthetic institutions, officers,
> and complaints. It is not affiliated with or operated by AICTE or any
> government agency, and it does not submit grievances to them. SLA deadlines
> and regional mappings are configurable project proposals, not verified
> statutory requirements.

## Features

- Complaint submission and tracking with an auditable case history.
- Role-specific workspaces for complainants, caseworkers, investigators,
  bureau leadership, national oversight, and administrators.
- Connected case intelligence for potential duplicate and overlapping
  complaints; suggestions are advisory and decisions remain with authorized
  officers.
- Workload, deadline, and geographic dashboards using synthetic records.
- Optional, explicitly requested AI assistance for complaint text.

## Getting started

Requirements: Node.js and npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). By default, the project
uses a local embedded database; leave `DATABASE_URL` empty in `.env.local` for
that mode. Keep credentials and other secrets out of Git.

## Optional configuration

- **Hosted database:** Set `DATABASE_URL` to a provisioned PostgreSQL
  connection string.
- **Email notifications:** Configure the SMTP values in `.env.local`. Real
  email is disabled unless `ALLOW_REAL_EMAIL` is enabled.
- **AI assistance:** Set `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` to enable
  the opt-in OpenAI-compatible assistant. Complaint text is sent to that
  provider only when a user explicitly requests analysis; review provider
  retention policies before enabling it.

## Development

```powershell
npm run typecheck
npm test
npm run build
```

Useful scripts:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run start` | Start the production server after building |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run db:setup` | Set up demonstration users |
| `npm run demo:credentials` | Display locally generated demo credentials |

## Dataset and model notes

The supplied dataset and duplicate-model evaluation are synthetic. The
classifier's measured performance on synthetic data is not evidence of
performance on real grievance language. See [Dataset provenance](docs/DATASET.md)
and [duplicate intelligence and limitations](docs/ML.md) for details.

Dataset preparation and model training instructions are in
[scripts/import-dataset/README.md](scripts/import-dataset/README.md) and
[ml/README.md](ml/README.md).
