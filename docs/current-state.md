# Current State

## Product summary

Job Optimizer is a local-first React Native job search assistant. The current build helps narrow incoming job leads, rank them for fit, and prepare a cleaner apply queue before any automation touches an application flow.

## Current goals

- Focus the search on React Native and adjacent mobile roles
- Reduce time wasted on low-fit postings
- Keep a lightweight pipeline without needing a backend or database
- Create a stable base for future automation
- Let the candidate profile itself sharpen recommendations

## Non-goals in the current build

- Automatic application submission
- Deep resume parsing
- Authentication or user accounts
- Multi-user collaboration
- Backend persistence beyond local files and browser storage

## What is implemented

### Frontend dashboard

The app is a static browser experience served by a tiny Node server.

Main interface areas:

- Hero section with a spotlight card showing the best current fit
- Profile form for salary floor, public profile links, target titles, core skills, bonus skills, avoid phrases, and resume text
- Candidate assets area showing stored links and resume-derived skills
- Resume import supporting text, Markdown, and PDF files
- Search Recipes section that generates live search links from the profile
- Import Jobs section for pulling roles from ATS and direct job URLs
- One-click `Load Greenhouse jobs` action for surfacing autofill-compatible leads
- Add Job form for manually pasting new roles into the board
- Snapshot section showing metrics and an `Apply next` queue for leads you explicitly move out of the ranked board
- Application-profile fields for autofill identity data such as name, email, phone, current location, and resume file path
- Application answers section for repeat screening answers such as pronouns, source, employment preference, agency experience, start timing, and ZIP code
- Snapshot automation summary showing readiness, supported queue counts, and the next Greenhouse command to run
- Reference Shelf for jobs moved to `Applied` or `Archived`
- Filters for board view, fit, status, and text search
- Filters for board view, fit, source, status, and text search
- Ranked job list
- Detail panel with fit breakdown, risks, pitch bullets, resume focus, and status updates

### Job scoring and ranking

Each job is scored against the current profile and assigned a fit bucket:

- `strong`
- `worth`
- `stretch`
- `skip`

Signals used in scoring today:

- Title match for React Native, Expo, or mobile-oriented roles
- Overlap with target titles
- Core skill matches
- Bonus skill matches
- Resume-derived skill matches
- Remote friendliness
- Salary range against the profile floor
- Avoid-keyword penalties
- Native-only warning signs such as Swift or Kotlin without React Native context
- Onsite-heavy wording

The output of scoring powers:

- the spotlight card
- top-level metrics
- the `Apply next` queue for manually queued roles
- the ranked list order
- the detail panel guidance
- the exported application kit used by automation scripts

### Persistence

The app persists browser-side state using `localStorage`.

Stored keys:

- `job-optimizer-discovery-settings`
- `job-optimizer-profile`
- `job-optimizer-custom-jobs`
- `job-optimizer-imported-jobs`
- `job-optimizer-statuses`

This means:

- profile edits survive refreshes
- saved exact-import source URLs survive refreshes
- the auto-pull preference and curated discovery position survive refreshes
- resume text survives refreshes in the same browser
- LinkedIn, GitHub, and portfolio links survive refreshes in the same browser
- pasted jobs survive refreshes in the same browser
- imported ATS jobs survive refreshes in the same browser
- status changes survive refreshes in the same browser
- applied and archived jobs stay referenceable in their own shelf

### Starter data and live importing

The project currently ships with a small starter snapshot of real roles in `data/jobs.json`.

That starter file is useful for first-run scoring, but it is still only a snapshot. It will age unless refreshed.

The app now also supports live job importing from pasted URLs. The current importer supports:

- Greenhouse board URLs and job URLs
- Lever board URLs and job URLs
- Ashby board URLs and job URLs
- direct job pages exposing structured `JobPosting` data

The UI also includes a `Load starter jobs` action that imports a curated starter set of current live postings without requiring you to hunt down URLs first.

There is also a `Pull more jobs` action that rotates through broader curated discovery batches across a 40+ source ATS pool, plus an optional auto-pull setting that fetches the next batch once when active leads reach zero.

Discovery can now be tuned with a location mode:

- `Remote preferred`
- `Remote only`
- `Any location`

`Remote preferred` is intentionally strict: it keeps remote-friendly roles first and only falls back to a very small number of ambiguous listings when a batch is light on clearly remote matches.

Discovery also supports excluded location phrases, so you can filter out places you do not want to target, such as `India`, `Hyderabad`, or `Bengaluru`.

Imported jobs are:

- normalized into the app job shape
- filtered through the active location mode during discovery
- filtered for React Native and mobile relevance
- deduped against each other and existing imported items
- persisted locally in the browser

There is also an optional CLI script in `scripts/fetch-jobs.mjs` that uses the same importer logic and:

- accepts one or more board or job URLs
- keeps seeded jobs in place so the app stays usable offline
- writes the merged result back into `data/jobs.json`

There is now also a scheduled-friendly sync script in `scripts/sync-jobs.mjs` that:

- refreshes `data/jobs.json` from the shared starter and curated discovery source pool
- applies the same remote mode logic used by the UI
- supports `--exclude-locations=` for recurring region filters
- writes a `data/job-sync-report.json` summary
- refuses to overwrite `data/jobs.json` with an empty sync result

### Export

The Snapshot panel includes an export action that downloads the current apply queue as JSON.

The export now produces a richer application kit for `Apply next` jobs, including candidate autofill data, job fit context, and adapter hints for local automation runners.
Greenhouse roles are marked as supported today, while Lever, Ashby, and generic roles stay on the manual-review path until those adapters are added.
The candidate payload now also includes a small answer bank so Greenhouse autofill can handle standard screening questions without guessing every time.

## Technical decisions made so far

- Plain HTML, CSS, and JavaScript instead of a framework
- Minimal runtime dependencies, with Playwright added for local browser autofill
- Local-first persistence via `localStorage`
- JSON file as the current job source of truth
- Small custom Node server instead of external dev tooling
- Resume text is parsed locally with a lightweight keyword matcher
- PDF import uses local macOS PDFKit extraction through the app server
- Live job import uses ATS JSON APIs when available and falls back to structured job-page parsing
- Multi-source imports now fan out in parallel with request timeouts so one slow board does not stall the full pull
- The first automation runner is a local Greenhouse autofill script that works from an exported application kit, supports single-job or `--all` runs, and pauses before submit
- The Greenhouse runner now fills common screening questions when matching saved answers exist and writes a per-run report with filled, missing, and unmatched items
- There is now also a headless Greenhouse smoke-test command that reuses the newest exported application kit and writes a summarized health report into `data/greenhouse-smoke-report.json`
- The Greenhouse runner now has a guarded `--submit` mode that refuses to click submit when required blockers or CAPTCHA are still present, and records those blockers in the report

These choices were made to keep the first version easy to run, easy to inspect, and quick to evolve.

## Known limitations

- No true auto-apply flow yet
- Some Greenhouse fields, especially location autocomplete widgets, may still require manual confirmation when the site does not return a selectable option
- No scraping or authenticated job-board integrations
- No resume-to-job gap analysis yet
- PDF import currently relies on local macOS support
- No cover letter generation beyond short pitch bullets
- No backend, sync, or cross-device persistence
- Live discovery in the browser is still user-initiated, even though the CLI sync can now refresh the broader built-in source pool on a schedule
- The starter job snapshot will go stale unless refreshed
- Normalization is good for common ATS fields but not yet exhaustive for every board variant

## Extension points for the next phase

Good next layers to build on top of this version:

- browser automation with a review step before submit
- richer discovery workflows from saved source lists, email digests, CSV, or clipboard feeds
- resume tailoring and bullet selection
- company research and red-flag detection
- better scoring controls and weighting
- notes, reminders, and follow-up tracking
- backend storage and shared state if needed later

## File map

- `index.html`: page structure and UI sections
- `styles.css`: layout, theme, components, and responsive behavior
- `app.js`: state, rendering, scoring, export, and all user interactions
- `data/jobs.json`: seeded job records
- `lib/job-discovery.mjs`: ATS and direct URL import logic
- `scripts/fetch-jobs.mjs`: CLI entry point for live ingestion
- `server.mjs`: static local server plus local import endpoints
