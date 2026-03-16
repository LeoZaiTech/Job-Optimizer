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
- Add Job form for manually pasting new roles into the board
- Snapshot section showing metrics and an `Apply next` queue
- Reference Shelf for jobs moved to `Applied` or `Archived`
- Filters for fit, status, and text search
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
- the `Apply next` queue
- the ranked list order
- the detail panel guidance

### Persistence

The app persists browser-side state using `localStorage`.

Stored keys:

- `job-optimizer-profile`
- `job-optimizer-custom-jobs`
- `job-optimizer-imported-jobs`
- `job-optimizer-statuses`

This means:

- profile edits survive refreshes
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

Imported jobs are:

- normalized into the app job shape
- filtered for React Native and mobile relevance
- deduped against each other and existing imported items
- persisted locally in the browser

There is also an optional CLI script in `scripts/fetch-jobs.mjs` that uses the same importer logic and:

- accepts one or more board or job URLs
- keeps seeded jobs in place so the app stays usable offline
- writes the merged result back into `data/jobs.json`

### Export

The Snapshot panel includes an export action that downloads the current apply queue as JSON.

## Technical decisions made so far

- Plain HTML, CSS, and JavaScript instead of a framework
- Zero runtime dependencies
- Local-first persistence via `localStorage`
- JSON file as the current job source of truth
- Small custom Node server instead of external dev tooling
- Resume text is parsed locally with a lightweight keyword matcher
- PDF import uses local macOS PDFKit extraction through the app server
- Live job import uses ATS JSON APIs when available and falls back to structured job-page parsing

These choices were made to keep the first version easy to run, easy to inspect, and quick to evolve.

## Known limitations

- No true auto-apply flow yet
- No scraping or authenticated job-board integrations
- No resume-to-job gap analysis yet
- PDF import currently relies on local macOS support
- No cover letter generation beyond short pitch bullets
- No backend, sync, or cross-device persistence
- Live discovery is still user-initiated by pasted URLs rather than automatic crawling or saved-search sync
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
