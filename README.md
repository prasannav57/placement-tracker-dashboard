# AI-Powered Placement Intelligence System

An upgraded placement dashboard for PSNA students and placement cell staff. The system combines eligibility checks, chart-based analytics, AI-style resume matching, and live company management in one full-stack application.

## Features

- Smart dashboard with branch-wise placement percentage and company-wise hiring charts
- Student eligibility checker with saved submissions for analytics
- Resume-to-job matching with score-based recommendations
- Company management with create, edit, delete, search, filtering, and pagination
- File-backed persistence for company data and saved student checks
- Cache-friendly backend structure for faster repeated reads

## Tech Stack

- HTML
- CSS
- JavaScript
- Chart.js
- Node.js
- Express

## Project Structure

```bash
placement-site/
|-- data/
|   |-- companies.json
|   `-- studentChecks.json
|-- index.html
|-- style.css
|-- script.js
|-- server.js
|-- package.json
`-- README.md
```

## Core Flows

1. Students submit academic details to check eligibility.
2. Each saved check updates branch and company analytics.
3. Resume text is matched against role and skill metadata.
4. Placement cell staff manage hiring rules from the admin panel.

## API Endpoints

- `GET /api/companies` - paginated and filterable company list
- `POST /api/companies` - add a company
- `PUT /api/companies/:id` - update a company
- `DELETE /api/companies/:id` - delete a company
- `GET /api/analytics` - dashboard analytics
- `POST /api/eligibility/check` - run and save an eligibility check
- `POST /api/resume/match` - generate AI-style recommendations

## Run Locally

```bash
npm install
npm start
```

Then open `http://localhost:3000`.
