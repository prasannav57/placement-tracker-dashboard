# AI-Powered Placement Intelligence System

A full-stack placement SaaS prototype for students and placement teams. It combines analytics, AI-style resume scoring, rate-limited APIs, pagination, dark mode, and optional Redis/BullMQ infrastructure in a single deployable app.

## Highlights

- Smart dashboard:
  - placement percentage by branch
  - top hiring companies
  - average salary trend
  - selected vs rejected ratio
- AI feature:
  - resume to job matching score
  - top 5 job recommendations
- System design upgrades:
  - API rate limiting with `express-rate-limit`
  - optional Redis-backed caching
  - optional BullMQ resume-analysis queue
  - pagination and filtering for company listings
- UI/UX upgrades:
  - dark mode toggle
  - loading skeletons
  - polished empty states
  - SaaS-style dashboard layout

## Tech Stack

- HTML
- CSS
- JavaScript
- Node.js
- Express
- express-rate-limit
- ioredis
- BullMQ

## Optional Infra

If `REDIS_URL` is configured, the app switches from local memory mode to:

- Redis cache for repeated reads
- BullMQ queue for resume matching jobs

Without `REDIS_URL`, the app still works in local fallback mode.

## Main Endpoints

- `GET /api/system/meta`
- `GET /api/companies`
- `POST /api/companies`
- `PUT /api/companies/:id`
- `DELETE /api/companies/:id`
- `GET /api/analytics`
- `POST /api/eligibility/check`
- `POST /api/resume/match`

## Run

```bash
npm install
npm start
```

Then open `http://localhost:3000`.
