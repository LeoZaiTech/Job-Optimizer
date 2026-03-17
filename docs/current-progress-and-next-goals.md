# Current Progress and Next Goals

## Purpose of the App

Job Optimizer is meant to become a React Native job-search copilot: one place to store your candidate profile, pull in job leads, rank them for fit, and help you focus only on applications worth your time.

Right now, it is a local-first prototype for the "find and qualify" part of the workflow. It is not yet a full auto-apply system.

## Current Progress

### What the app does today

- Stores your profile locally, including summary, salary floor, target titles, skills, avoid phrases, resume text, and public profile links
- Imports resume text from `.txt`, `.md`, and `.pdf`
- Extracts lightweight resume signals and uses them in job scoring
- Imports live jobs from Greenhouse, Lever, Ashby, and structured job URLs
- Normalizes and dedupes imported jobs, then stores them locally in the browser
- Lets you paste in jobs manually and score them against your profile
- Shows a ranked board, fit buckets, an `Apply next` queue, and job detail guidance
- Generates search recipes for LinkedIn, Google, Greenhouse, and Lever
- Exports a shortlist
- Includes a scheduled-friendly sync script that can refresh the broader discovery pool into `data/jobs.json`

### What is still placeholder or incomplete

- `data/jobs.json` now holds a small live starter snapshot, but it will age without refresh
- Live discovery in the browser still depends on URLs you paste in or the built-in source pool rather than saved-search sync
- The app does not auto-apply yet
- It does not enrich your profile from LinkedIn or GitHub automatically
- Resume parsing is still lightweight keyword extraction, not deep resume understanding
- There is no backend, database, login, or cross-device sync
- Search recipes open searches, but they do not ingest results back into the app automatically

## What This App Should Become

The long-term goal is a practical job-search system with four layers:

### 1. Profile intelligence

Your resume, LinkedIn, GitHub, portfolio, preferences, target titles, compensation floor, remote or hybrid rules, and exclusions become your source of truth.

### 2. Job discovery

The app pulls real React Native and adjacent mobile roles from job boards, company ATS pages, saved searches, and possibly email alerts.

### 3. Match and qualify

Each job gets scored for real fit, including:

- Tech overlap
- Seniority match
- Remote and location fit
- Compensation fit
- Company and role-type fit
- Red flags
- How well your resume can be tailored for it

### 4. Application execution

For strong matches, the app should help prepare and optionally automate:

- Tailored resume bullets
- Short intro or cover note
- Autofill answers
- Browser automation with review before submit
- Tracking status and follow-ups

## Next Goals

### What still needs to be built

- Broader discovery workflows beyond pasted URLs
- Better normalization of job data
- Stronger matching logic tied to your actual experience
- Resume tailoring per job
- Company research and red-flag detection
- Application tracking beyond a simple local status
- Human-reviewed auto-fill or auto-apply workflow
- Optional backend persistence if this becomes a real daily tool

### Recommended build order

1. Put the new discovery sync on a schedule
2. Better matching and normalization
3. Tailored resume and pitch generation
4. Safe browser automation with review before submit
5. Backend storage and sync, only if needed later

## Current Honest Assessment

Today’s app is now a stronger front-end shell with a working first pass at live ATS ingestion plus a local scoring engine. The biggest remaining value is in broader discovery, richer matching, and turning strong matches into faster applications.
