# Job Optimizer

Job Optimizer is a zero-dependency local dashboard for narrowing your job search around React Native work. It helps you:

- score roles against your React Native profile
- store resume text plus LinkedIn, GitHub, and portfolio links locally
- import resume files from `.txt`, `.md`, and `.pdf`
- import live jobs from ATS and job URLs
- keep an "apply next" queue
- save custom jobs by pasting descriptions
- generate search recipes for LinkedIn, Greenhouse, and Lever
- export a shortlist to JSON

## Documentation

- [`docs/current-state.md`](docs/current-state.md): product snapshot, implemented features, limitations, and extension points
- [`docs/frontend-architecture.md`](docs/frontend-architecture.md): UI structure, state flow, scoring pipeline, and persistence model

## Why this first version does not auto-submit applications

Auto-applying across job boards is possible, but it is brittle and usually lower quality than a guided workflow. Different sites have different flows, anti-bot checks, and custom questions. This first version builds the stable part first: finding, ranking, and preparing strong applications.

If you want, the next step can be a browser automation layer that opens high-score roles, fills common fields, and pauses for review before submit.

## Run it

```bash
npm start
```

Then open [http://localhost:4173](http://localhost:4173).
If your environment blocks `localhost`, use [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Import live jobs

From the app UI, use the `Import Jobs` panel and paste one or more URLs:

- Greenhouse board or job URLs
- Lever board or job URLs
- Ashby board or job URLs
- direct job pages with structured `JobPosting` data

Imported jobs are normalized, deduped, scored, and stored locally in the browser alongside your custom jobs. The UI also includes a `Load starter jobs` action that pulls in a vetted starter set of current live mobile roles.

## Refresh `data/jobs.json` from live sources

```bash
npm run fetch:jobs -- https://boards.greenhouse.io/company
```

Notes:

- You can pass multiple board or job URLs.
- The fetch script uses the same importer logic as the UI.
- The fetch script merges imported jobs into `data/jobs.json`.
- It keeps the seeded sample jobs so the app is still usable offline.
- Live ATS validation has been checked against Greenhouse, Lever, and Ashby endpoints.
- This is still a user-guided import flow, not a background crawler or authenticated board integration.

## Project structure

- `index.html`: app shell
- `styles.css`: visual system and responsive layout
- `app.js`: scoring engine, local state, rendering, export
- `data/jobs.json`: seeded roles plus imported roles
- `data/jobs.json`: small starter set of real roles plus imported roles
- `lib/job-discovery.mjs`: ATS and job-page import + normalization
- `scripts/fetch-jobs.mjs`: CLI importer for board and job URLs
- `server.mjs`: tiny static server plus local import and PDF extraction endpoints
