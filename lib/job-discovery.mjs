const JOB_KEYWORDS = [
  "react native",
  "expo",
  "expo router",
  "mobile engineer",
  "mobile developer",
  "mobile app",
  "ios",
  "android",
  "cross-platform",
  "typescript",
  "javascript",
  "redux",
  "graphql",
  "apollo",
  "react query",
  "zustand",
  "detox",
  "jest",
  "fastlane",
  "app store",
  "play store",
  "native modules",
  "react navigation",
  "mapbox",
  "firebase",
  "biometric",
  "apple pay",
  "google pay"
];

const TITLE_MOBILE_ROLE_KEYWORDS = [
  "react native",
  "expo",
  "mobile engineer",
  "mobile developer",
  "mobile software engineer",
  "ios engineer",
  "ios developer",
  "android engineer",
  "android developer",
  "cross-platform",
  "cross platform"
];

const HIGH_CONFIDENCE_STACK_KEYWORDS = [
  "react native",
  "expo",
  "expo router",
  "native modules",
  "react navigation",
  "detox",
  "fastlane",
  "app store",
  "play store"
];

const PLATFORM_CONTEXT_KEYWORDS = [
  "ios",
  "android",
  "mobile app",
  "mobile apps",
  "mobile application",
  "mobile applications",
  "cross-platform",
  "cross platform"
];

const ENGINEERING_TITLE_KEYWORDS = [
  "engineer",
  "developer",
  "architect",
  "lead"
];

const DESCRIPTION_DISQUALIFIER_KEYWORDS = [
  "mobile device management",
  "endpoint management",
  "device management"
];

const SOURCE_LABELS = {
  ashby: "Ashby",
  generic: "Direct URL",
  greenhouse: "Greenhouse",
  lever: "Lever"
};

const USER_AGENT = "JobOptimizer/0.2 (+local job discovery)";

export async function importJobsFromUrls(inputs) {
  const normalizedInputs = normalizeInputs(inputs);
  const jobs = [];
  const errors = [];
  const sources = [];

  for (const input of normalizedInputs) {
    try {
      const result = await importJobsFromInput(input);
      const relevantJobs = dedupeJobs(result.jobs).filter(isRelevant);
      jobs.push(...relevantJobs);
      sources.push({
        importedCount: relevantJobs.length,
        input,
        sourceType: result.sourceType
      });
    } catch (error) {
      errors.push({
        error: error instanceof Error ? error.message : "Import failed.",
        input
      });
    }
  }

  return {
    errors,
    jobs: dedupeJobs(jobs).filter(isRelevant),
    sources
  };
}

async function importJobsFromInput(input) {
  const url = normalizeUrl(input);
  const sourceType = detectSourceType(url);

  if (sourceType === "greenhouse") {
    return importGreenhouse(url, input);
  }

  if (sourceType === "lever") {
    return importLever(url, input);
  }

  if (sourceType === "ashby") {
    return importAshby(url, input);
  }

  return importGenericJobPage(url, input);
}

async function importGreenhouse(url, input) {
  const { boardToken, jobId } = parseGreenhouseUrl(url);
  if (!boardToken) {
    throw new Error("Could not detect the Greenhouse board token from that URL.");
  }

  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;
  const payload = await requestJson(apiUrl);
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

  const normalizedJobs = jobs.map((job) => normalizeGreenhouseJob(job, { boardToken, input }));
  return {
    jobs: jobId
      ? normalizedJobs.filter((job) => job.externalId === jobId || job.url.includes(jobId))
      : normalizedJobs,
    sourceType: "greenhouse"
  };
}

async function importLever(url, input) {
  const { postingId, site } = parseLeverUrl(url);
  if (!site) {
    throw new Error("Could not detect the Lever site from that URL.");
  }

  const apiUrl = `https://api.lever.co/v0/postings/${site}?mode=json`;
  const payload = await requestJson(apiUrl);
  const jobs = Array.isArray(payload) ? payload : [];

  const normalizedJobs = jobs.map((job) => normalizeLeverJob(job, { input, site }));
  return {
    jobs: postingId
      ? normalizedJobs.filter((job) => job.externalId === postingId || job.url.includes(postingId))
      : normalizedJobs,
    sourceType: "lever"
  };
}

async function importAshby(url, input) {
  const { boardName, jobSlug } = parseAshbyUrl(url);
  if (!boardName) {
    throw new Error("Could not detect the Ashby board name from that URL.");
  }

  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${boardName}?includeCompensation=true`;
  const payload = await requestJson(apiUrl);
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];

  const normalizedJobs = jobs.map((job) => normalizeAshbyJob(job, { boardName, input }));
  return {
    jobs: jobSlug
      ? normalizedJobs.filter((job) => job.externalId === jobSlug || job.url.includes(jobSlug))
      : normalizedJobs,
    sourceType: "ashby"
  };
}

async function importGenericJobPage(url, input) {
  const html = await requestText(url.toString());
  const jsonLdObjects = extractJsonLdObjects(html);
  const jobPosting = findJobPosting(jsonLdObjects);

  if (jobPosting) {
    return {
      jobs: [normalizeGenericJobPosting(jobPosting, { input, url })],
      sourceType: "generic"
    };
  }

  throw new Error("That URL did not look like a supported job board or a job page with structured data.");
}

function normalizeGreenhouseJob(job, context) {
  const description = htmlToText(job.content || "");
  const salary = extractSalaryRange(description);
  const metadata = Array.isArray(job.metadata) ? job.metadata : [];
  const location = firstTruthy(job.location?.name, findMetadataValue(metadata, ["location"]), "Not specified");
  const employmentType = firstTruthy(
    findMetadataValue(metadata, ["employment type", "commitment", "type"]),
    "Unknown"
  );

  return normalizeImportedJob({
    company: firstTruthy(job.company_name, humanizeSlug(context.boardToken)),
    department: findMetadataValue(metadata, ["department"]),
    description,
    employmentType,
    externalId: String(job.id || ""),
    id: `greenhouse-${context.boardToken}-${job.id}`,
    importedFrom: context.input,
    location,
    postedAt: normalizeDate(job.updated_at || job.created_at),
    remote: isRemoteText(`${location} ${description}`),
    salaryMax: salary.max,
    salaryMin: salary.min,
    source: "greenhouse",
    sourceLabel: SOURCE_LABELS.greenhouse,
    sourceUrl: `https://boards.greenhouse.io/${context.boardToken}`,
    team: findMetadataValue(metadata, ["team"]),
    title: firstTruthy(job.title, "Untitled role"),
    url: firstTruthy(job.absolute_url, `https://boards.greenhouse.io/${context.boardToken}/jobs/${job.id}`)
  });
}

function normalizeLeverJob(job, context) {
  const description = htmlToText(
    firstTruthy(job.descriptionPlain, job.description, serializeLeverLists(job.lists))
  );
  const location = firstTruthy(
    job.categories?.location,
    Array.isArray(job.categories?.allLocations) ? job.categories.allLocations.join(", ") : "",
    "Not specified"
  );
  const salary = extractSalaryRange(description);

  return normalizeImportedJob({
    company: firstTruthy(job.company, humanizeSlug(context.site)),
    department: firstTruthy(job.categories?.department, job.categories?.group),
    description,
    employmentType: firstTruthy(job.categories?.commitment, "Unknown"),
    externalId: String(job.id || ""),
    id: `lever-${context.site}-${job.id}`,
    importedFrom: context.input,
    location,
    postedAt: normalizeDate(job.createdAt || job.updatedAt),
    remote: isRemoteText(`${location} ${job.workplaceType || ""} ${description}`),
    salaryMax: salary.max,
    salaryMin: salary.min,
    source: "lever",
    sourceLabel: SOURCE_LABELS.lever,
    sourceUrl: `https://jobs.lever.co/${context.site}`,
    team: firstTruthy(job.categories?.team),
    title: firstTruthy(job.text, "Untitled role"),
    url: firstTruthy(job.hostedUrl, job.applyUrl, `https://jobs.lever.co/${context.site}/${job.id}`)
  });
}

function normalizeAshbyJob(job, context) {
  const description = htmlToText(
    firstTruthy(job.descriptionHtml, job.description, job.descriptionPlain, job.content)
  );
  const salary = extractSalaryRange(
    `${description}\n${JSON.stringify(job.compensation || {})}\n${JSON.stringify(job.salary || {})}`
  );
  const location = firstTruthy(
    job.locationName,
    job.location,
    job.workplaceRequirements?.locationName,
    "Not specified"
  );

  return normalizeImportedJob({
    company: firstTruthy(job.companyName, humanizeSlug(context.boardName)),
    department: firstTruthy(job.departmentName, job.department?.name),
    description,
    employmentType: firstTruthy(job.employmentType, job.commitment, "Unknown"),
    externalId: String(job.id || job.jobUrl?.split("/").filter(Boolean).at(-1) || ""),
    id: `ashby-${context.boardName}-${job.id || hashKey(job.title, job.jobUrl)}`,
    importedFrom: context.input,
    location,
    postedAt: normalizeDate(job.publishedDate || job.postedAt || job.createdAt),
    remote: isRemoteText(`${location} ${job.workplaceType || ""} ${description}`),
    salaryMax: salary.max,
    salaryMin: salary.min,
    source: "ashby",
    sourceLabel: SOURCE_LABELS.ashby,
    sourceUrl: `https://jobs.ashbyhq.com/${context.boardName}`,
    team: firstTruthy(job.teamName, job.team?.name),
    title: firstTruthy(job.title, job.name, "Untitled role"),
    url: firstTruthy(
      job.jobUrl,
      job.absoluteUrl,
      job.applyUrl,
      `https://jobs.ashbyhq.com/${context.boardName}/${job.id}`
    )
  });
}

function normalizeGenericJobPosting(jobPosting, context) {
  const title = firstTruthy(jobPosting.title, jobPosting.name, "Untitled role");
  const description = htmlToText(firstTruthy(jobPosting.description, ""));
  const location = formatJobPostingLocation(jobPosting.jobLocation);
  const salary = extractSalaryRange(
    `${description}\n${JSON.stringify(jobPosting.baseSalary || {})}\n${JSON.stringify(jobPosting.estimatedSalary || {})}`
  );

  return normalizeImportedJob({
    company: firstTruthy(
      jobPosting.hiringOrganization?.name,
      jobPosting.organization?.name,
      context.url.hostname.replace(/^www\./, "")
    ),
    description,
    employmentType: formatEmploymentType(jobPosting.employmentType),
    externalId: String(firstTruthy(jobPosting.identifier?.value, hashKey(title, context.url.toString()))),
    id: `generic-${hashKey(title, context.url.toString())}`,
    importedFrom: context.input,
    location,
    postedAt: normalizeDate(jobPosting.datePosted || jobPosting.dateCreated),
    remote: isRemoteText(`${location} ${description}`),
    salaryMax: salary.max,
    salaryMin: salary.min,
    source: "generic",
    sourceLabel: SOURCE_LABELS.generic,
    sourceUrl: context.url.origin,
    title,
    url: context.url.toString()
  });
}

function normalizeImportedJob(job) {
  const description = normalizeWhitespace(job.description || "");
  return {
    company: String(job.company || "Unknown company").trim(),
    department: job.department ? String(job.department).trim() : "",
    description,
    employmentType: String(job.employmentType || "Unknown").trim(),
    externalId: String(job.externalId || ""),
    id: String(job.id || `job-${Date.now()}`),
    importedAt: new Date().toISOString(),
    importedFrom: String(job.importedFrom || ""),
    location: String(job.location || "Not specified").trim(),
    postedAt: String(job.postedAt || new Date().toISOString().slice(0, 10)),
    remote: Boolean(job.remote),
    salaryMax: Number(job.salaryMax || 0) || null,
    salaryMin: Number(job.salaryMin || 0) || null,
    skills: extractSkills(description, job.title, job.company),
    source: String(job.source || "unknown"),
    sourceLabel: String(job.sourceLabel || humanizeSlug(job.source || "source")),
    sourceUrl: String(job.sourceUrl || ""),
    team: job.team ? String(job.team).trim() : "",
    title: String(job.title || "Untitled role").trim(),
    url: String(job.url || "").trim()
  };
}

function extractSkills(...values) {
  const blob = normalizeSearchText(values.join(" "));
  return JOB_KEYWORDS.filter((keyword) => containsKeyword(blob, keyword)).map(titleCaseKeyword);
}

function isRelevant(job) {
  const titleBlob = normalizeSearchText(`${job.title} ${job.team} ${job.department}`);
  const descriptionBlob = normalizeSearchText(`${job.description} ${job.skills.join(" ")}`);

  if (hasKeywordMatch(descriptionBlob, DESCRIPTION_DISQUALIFIER_KEYWORDS)) {
    return false;
  }

  if (hasKeywordMatch(titleBlob, TITLE_MOBILE_ROLE_KEYWORDS)) {
    return true;
  }

  const titleHasEngineeringRole = hasKeywordMatch(titleBlob, ENGINEERING_TITLE_KEYWORDS);
  const titleHasPlatformContext = hasKeywordMatch(titleBlob, [
    "react native",
    "expo",
    "mobile",
    "ios",
    "android",
    "cross-platform",
    "cross platform"
  ]);
  const stackHits = countKeywordMatches(descriptionBlob, HIGH_CONFIDENCE_STACK_KEYWORDS);
  const platformHits = countKeywordMatches(descriptionBlob, PLATFORM_CONTEXT_KEYWORDS);

  if (titleHasEngineeringRole && titleHasPlatformContext) {
    return true;
  }

  if (stackHits >= 2) {
    return true;
  }

  return titleHasEngineeringRole && stackHits >= 1 && platformHits >= 1;
}

function dedupeJobs(jobs) {
  const seen = new Set();

  return jobs.filter((job) => {
    const key = [
      job.url || "",
      job.externalId || "",
      `${job.company}::${job.title}`.toLowerCase()
    ].join("::");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function detectSourceType(url) {
  const host = url.hostname.toLowerCase();

  if (
    host === "boards.greenhouse.io" ||
    host === "job-boards.greenhouse.io" ||
    host === "boards-api.greenhouse.io"
  ) {
    return "greenhouse";
  }

  if (host === "api.lever.co" || host.endsWith(".lever.co") || host === "jobs.lever.co") {
    return "lever";
  }

  if (host === "jobs.ashbyhq.com" || host === "api.ashbyhq.com") {
    return "ashby";
  }

  return "generic";
}

function parseGreenhouseUrl(url) {
  const segments = url.pathname.split("/").filter(Boolean);

  if (url.hostname === "boards-api.greenhouse.io") {
    const boardIndex = segments.indexOf("boards");
    const jobsIndex = segments.indexOf("jobs");
    return {
      boardToken: boardIndex >= 0 ? segments[boardIndex + 1] : "",
      jobId: jobsIndex >= 0 ? segments[jobsIndex + 1] || "" : ""
    };
  }

  if (segments[0] === "embed") {
    return {
      boardToken: url.searchParams.get("for") || "",
      jobId: ""
    };
  }

  const jobsIndex = segments.indexOf("jobs");
  return {
    boardToken: segments[0] || "",
    jobId: jobsIndex >= 0 ? segments[jobsIndex + 1] || "" : ""
  };
}

function parseLeverUrl(url) {
  const segments = url.pathname.split("/").filter(Boolean);

  if (url.hostname === "api.lever.co") {
    const postingsIndex = segments.indexOf("postings");
    return {
      postingId: segments[postingsIndex + 2] || "",
      site: segments[postingsIndex + 1] || ""
    };
  }

  return {
    postingId: segments[1] && segments[1] !== "apply" ? segments[1] : "",
    site: segments[0] || ""
  };
}

function parseAshbyUrl(url) {
  const segments = url.pathname.split("/").filter(Boolean);

  if (url.hostname === "api.ashbyhq.com") {
    const boardIndex = segments.indexOf("job-board");
    return {
      boardName: boardIndex >= 0 ? segments[boardIndex + 1] : "",
      jobSlug: ""
    };
  }

  return {
    boardName: segments[0] || "",
    jobSlug: segments[1] && segments[1] !== "application" ? segments[1] : ""
  };
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`);
  }

  return response.json();
}

async function requestText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": USER_AGENT
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`);
  }

  return response.text();
}

function extractJsonLdObjects(html) {
  const objects = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      objects.push(parsed);
    } catch (error) {
      // Ignore malformed JSON-LD blobs and keep scanning.
    }
  }

  return objects.flatMap(flattenJsonLd);
}

function flattenJsonLd(value) {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value["@graph"])) {
    return value["@graph"].flatMap(flattenJsonLd);
  }

  return [value];
}

function findJobPosting(items) {
  return items.find((item) => {
    const type = item?.["@type"];
    if (Array.isArray(type)) {
      return type.includes("JobPosting");
    }
    return type === "JobPosting";
  });
}

function htmlToText(html) {
  const withBreaks = String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|ul|ol|h1|h2|h3|h4|h5|h6|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");

  return normalizeWhitespace(decodeHtmlEntities(withBreaks));
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, number) => String.fromCharCode(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractSalaryRange(value) {
  const text = String(value || "");
  const moneyPattern =
    /\$?\s*(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?k)\s*(?:-|to|–|—)\s*\$?\s*(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d+)?k)/i;
  const match = text.match(moneyPattern);

  if (!match) {
    return { max: null, min: null };
  }

  return {
    max: parseMoneyValue(match[2]),
    min: parseMoneyValue(match[1])
  };
}

function parseMoneyValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return null;
  }

  if (raw.endsWith("k")) {
    return Math.round(Number.parseFloat(raw) * 1000);
  }

  const digits = raw.replace(/[^0-9.]/g, "");
  return digits ? Math.round(Number.parseFloat(digits)) : null;
}

function normalizeDate(value) {
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  }

  const text = String(value || "").trim();
  if (!text) {
    return new Date().toISOString().slice(0, 10);
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function isRemoteText(value) {
  return /\b(remote|distributed|work from home|anywhere)\b/i.test(String(value || ""));
}

function findMetadataValue(items, labels) {
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  const match = items.find((item) => normalizedLabels.includes(String(item.name || "").toLowerCase()));
  return match ? String(match.value || "").trim() : "";
}

function serializeLeverLists(lists) {
  if (!Array.isArray(lists)) {
    return "";
  }

  return lists
    .map((item) => `${item.text || ""}\n${htmlToText(item.content || "")}`)
    .join("\n\n");
}

function formatJobPostingLocation(value) {
  if (!value) {
    return "Not specified";
  }

  const locations = Array.isArray(value) ? value : [value];
  const formatted = locations
    .map((item) => {
      const address = item.address || {};
      return [address.addressLocality, address.addressRegion, address.addressCountry]
        .filter(Boolean)
        .join(", ");
    })
    .filter(Boolean);

  return formatted[0] || "Not specified";
}

function formatEmploymentType(value) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value || "Unknown");
}

function normalizeInputs(inputs) {
  return Array.from(
    new Set(
      (Array.isArray(inputs) ? inputs : [inputs])
        .flatMap((value) => String(value || "").split("\n"))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function normalizeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    throw new Error("A source URL was empty.");
  }

  if (/^[a-z]+:\/\//i.test(raw)) {
    return new URL(raw);
  }

  return new URL(`https://${raw}`);
}

function titleCaseKeyword(value) {
  return value
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function containsKeyword(normalizedText, keyword) {
  const normalizedKeyword = normalizeSearchText(keyword);
  return normalizedText.includes(normalizedKeyword);
}

function hasKeywordMatch(normalizedText, keywords) {
  return keywords.some((keyword) => containsKeyword(normalizedText, keyword));
}

function countKeywordMatches(normalizedText, keywords) {
  return keywords.filter((keyword) => containsKeyword(normalizedText, keyword)).length;
}

function normalizeSearchText(value) {
  return ` ${String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function humanizeSlug(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function firstTruthy(...values) {
  return values.find((value) => typeof value === "string" ? value.trim() : value);
}

function hashKey(...parts) {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
