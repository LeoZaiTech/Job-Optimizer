# Job Optimizer

Job Optimizer is a zero-dependency local dashboard for narrowing your job search around React Native work. It helps you:

- score roles against your React Native profile
- store resume text plus LinkedIn, GitHub, and portfolio links locally
- import resume files from `.txt`, `.md`, and `.pdf`
- import live jobs from ATS and job URLs
- keep an "apply next" queue
- export an application kit from the `Apply next` queue
- save custom jobs by pasting descriptions
- generate search recipes for LinkedIn, Greenhouse, and Lever
- export a shortlist to JSON

## Documentation

- [`docs/current-state.md`](docs/current-state.md): product snapshot, implemented features, limitations, and extension points
- [`docs/frontend-architecture.md`](docs/frontend-architecture.md): UI structure, state flow, scoring pipeline, and persistence model

## Why this first version does not auto-submit applications

Auto-applying across job boards is possible, but it is brittle and usually lower quality than a guided workflow. Different sites have different flows, anti-bot checks, and custom questions. This first version builds the stable part first: finding, ranking, and preparing strong applications.

If you want, the next step can be a browser automation layer that opens high-score roles, fills common fields, and pauses for review before submit.

That first automation layer now starts with an exported application kit plus a Greenhouse autofill runner in review mode.
The Snapshot panel now also shows how many `Apply next` roles are Greenhouse-ready, which profile fields are still missing, and the exact command to run next.

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
There is also a `Load Greenhouse jobs` action that pulls a live Greenhouse-focused batch for autofill testing and pairs well with the new board `Source` filter.

You can also use `Pull more jobs` to rotate through broader curated discovery batches, while the textarea keeps your exact import sources handy. `Auto-pull when active leads hit zero` uses that same rotating discovery flow. The built-in discovery pool now spans 40+ ATS sources instead of a tiny starter loop.

The import panel now includes a location mode, with `Remote preferred` as the default discovery setting. In that mode, discovery keeps remote roles first and only allows a very small fallback of ambiguous location listings.

You can also add `Exclude locations` in the import panel to drop roles from places you do not want in the board, such as `India, Hyderabad, Bengaluru`.
On the board side, the Filters panel now includes `Source`, so you can isolate Greenhouse roles before moving them into `Apply next`.

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

## Sync the full discovery pool

```bash
npm run sync:jobs
```

This refreshes `data/jobs.json` from the shared starter and curated discovery sources, applies the same location filter used by the UI, and writes a sync report to `data/job-sync-report.json`.

Optional:

```bash
npm run sync:jobs -- --remote-mode=only
```

```bash
npm run sync:jobs -- --remote-mode=preferred --exclude-locations=india,hyderabad,bengaluru
```

The sync script will not overwrite `data/jobs.json` with an empty result set, which makes it much safer to run on a schedule.

## Start application automation

1. Fill in your application-profile fields in the dashboard:
- full name
- email
- phone
- current location
- work authorization
- sponsorship note
- resume file path
- common application answers such as pronouns, source, employment preference, start timing, and ZIP code

2. Move target roles into `Apply next`.

3. Click `Export application kit` in the Snapshot panel.

4. Run the Greenhouse review-mode autofill script:

```bash
npm run autofill:greenhouse -- /path/to/job-optimizer-application-kit.json
```

Optional:

```bash
npm run autofill:greenhouse -- /path/to/job-optimizer-application-kit.json --job=<job-id>
```

```bash
npm run autofill:greenhouse -- /path/to/job-optimizer-application-kit.json --all
```

Notes:

- This starter runner targets Greenhouse jobs only.
- Lever and Ashby jobs are still exported into the application kit, but they stay on the manual-review path for now.
- It fills common fields, repeatable Greenhouse screening questions, and uploads your resume when `resumeFilePath` is set.
- It pauses before submit so you can review the form manually.
- It writes a `*-greenhouse-report.json` file listing `fieldsFilled`, `fieldsMissing`, and any still-unmatched custom questions.
- Some Greenhouse comboboxes, especially location autocomplete fields, may still require manual review if the site does not return a selectable option.
- You will need `playwright` plus a Chromium browser install for the runner to work locally.

There is now also a guarded submit path:

```bash
npm run autofill:greenhouse -- /path/to/job-optimizer-application-kit.json --job=<job-id> --submit --headless
```

It will only attempt submit when required blockers are clear. Otherwise it refuses to submit and records `blockingIssues` in the report.

## Run a headless Greenhouse smoke test

```bash
npm run smoke:greenhouse
```

This command:

- finds the newest exported `job-optimizer-application-kit*.json` in `data`, `Downloads`, or `/tmp`
- runs the Greenhouse autofill script in headless review mode
- writes a summary to `data/greenhouse-smoke-report.json`
- surfaces submit blockers such as unresolved required questions or CAPTCHA

Useful options:

```bash
npm run smoke:greenhouse -- --job=greenhouse-fueledcareers-5134378008
```

```bash
npm run smoke:greenhouse -- --strict --allow-missing=location: value did not stick
```

By default the smoke summary ignores `full name: no matching input found`, since many Greenhouse forms split name into first and last fields.

## Project structure

- `index.html`: app shell
- `styles.css`: visual system and responsive layout
- `app.js`: scoring engine, local state, rendering, export
- `data/jobs.json`: small starter set of real roles plus imported roles
- `data/job-sync-report.json`: generated summary from the last scheduled or manual sync
- `lib/discovery-preferences.mjs`: shared remote-mode filtering helpers
- `lib/discovery-sources.mjs`: starter and curated discovery source lists
- `lib/job-discovery.mjs`: ATS and job-page import + normalization
- `scripts/autofill-greenhouse.mjs`: review-first Greenhouse application filler
- `scripts/fetch-jobs.mjs`: CLI importer for board and job URLs
- `scripts/sync-jobs.mjs`: scheduled-friendly discovery sync for ongoing refreshes
- `server.mjs`: tiny static server plus local import and PDF extraction endpoints
