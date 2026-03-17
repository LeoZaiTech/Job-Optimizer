export const STARTER_SOURCE_URLS = [
  "https://jobs.ashbyhq.com/Nash/dc9645ae-dab2-4ed1-8db4-b06ae790f747",
  "https://jobs.ashbyhq.com/partiful/0a8ff10d-0adb-4978-830b-f2901321302c",
  "https://jobs.lever.co/filevine/1935eaab-1536-442f-9b55-0110ce6abe3a",
  "https://jobs.lever.co/USMobile/5c7bd7b9-477a-4006-b766-486eb81bead2",
  "https://jobs.lever.co/wahed.com/11dae8eb-7800-42c6-b9b0-a19690a167a1",
  "https://boards.greenhouse.io/embed/job_board?for=bitso"
];

export const GREENHOUSE_AUTOFILL_SOURCE_URLS = [
  "https://boards.greenhouse.io/fluxon",
  "https://job-boards.greenhouse.io/oddball/jobs/7637599003",
  "https://job-boards.greenhouse.io/inspiren/jobs/5059525007",
  "https://job-boards.greenhouse.io/fueledcareers/jobs/5134378008",
  "https://job-boards.greenhouse.io/mattermost/jobs/5113880008"
];

export const CURATED_DISCOVERY_BATCHES = [
  [
    "https://jobs.lever.co/wahed.com",
    "https://jobs.lever.co/wilburlabs",
    "https://jobs.lever.co/Fliff",
    "https://jobs.lever.co/bluelightconsulting?department=Engineering"
  ],
  [
    "https://jobs.lever.co/Zeller",
    "https://jobs.lever.co/theodo",
    "https://jobs.lever.co/myollie",
    "https://jobs.lever.co/halter",
    "https://jobs.lever.co/qualysoft"
  ],
  [
    "https://jobs.ashbyhq.com/openai",
    "https://jobs.lever.co/bumbleinc",
    "https://boards.greenhouse.io/fluxon",
    "https://boards.greenhouse.io/embed/job_board?for=bitso",
    "https://boards.greenhouse.io/embed/job_board?for=fanduel"
  ],
  [
    "https://jobs.lever.co/fullspectrumsoftware",
    "https://jobs.lever.co/gradion",
    "https://jobs.lever.co/ciandt",
    "https://jobs.lever.co/filevine",
    "https://jobs.lever.co/zartis"
  ],
  [
    "https://jobs.lever.co/USMobile",
    "https://jobs.ashbyhq.com/Nash",
    "https://jobs.ashbyhq.com/partiful",
    "https://jobs.lever.co/pennylane",
    "https://boards.greenhouse.io/embed/job_board?for=companycam"
  ],
  [
    "https://jobs.ashbyhq.com/halter",
    "https://jobs.ashbyhq.com/frontcareers",
    "https://jobs.ashbyhq.com/backpack",
    "https://jobs.ashbyhq.com/Abridge"
  ],
  [
    "https://jobs.lever.co/idt",
    "https://jobs.lever.co/remedyproductstudio",
    "https://jobs.lever.co/luxurypresence",
    "https://jobs.lever.co/smart-working-solutions"
  ],
  [
    "https://boards.greenhouse.io/embed/job_board?for=skillzinc",
    "https://boards.greenhouse.io/embed/job_board?for=gympass",
    "https://boards.greenhouse.io/embed/job_board?for=vividseatsllc",
    "https://boards.greenhouse.io/embed/job_board?for=Chime"
  ]
];

export function allDiscoverySourceUrls() {
  return [...new Set([...STARTER_SOURCE_URLS, ...CURATED_DISCOVERY_BATCHES.flat()])];
}
