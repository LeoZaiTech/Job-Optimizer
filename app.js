import {
  applyDiscoveryRemoteMode,
  filterJobsByExcludedLocations,
  humanizeRemoteMode,
  normalizeExcludedLocations,
  normalizeRemoteMode
} from "./lib/discovery-preferences.mjs";
import {
  CURATED_DISCOVERY_BATCHES,
  GREENHOUSE_AUTOFILL_SOURCE_URLS,
  STARTER_SOURCE_URLS
} from "./lib/discovery-sources.mjs";

const STORAGE_KEYS = {
  customJobs: "job-optimizer-custom-jobs",
  discovery: "job-optimizer-discovery-settings",
  importedJobs: "job-optimizer-imported-jobs",
  profile: "job-optimizer-profile",
  statuses: "job-optimizer-statuses"
};

const DEFAULT_PROFILE = {
  answerAgencyExperience: "",
  answerAgencyName: "",
  answerEmploymentPreference: "",
  answerHearAbout: "",
  answerHearAboutDetail: "",
  answerPhoneCountry: "",
  answerPronouns: "",
  answerStartAvailability: "",
  answerUpcomingCommitments: "",
  answerUsZipCode: "",
  currentLocation: "",
  email: "",
  fullName: "",
  phone: "",
  summary: "React Native engineer focused on polished cross-platform product work.",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  resumeFilePath: "",
  salaryFloor: 150000,
  sponsorship: "",
  targetTitles:
    "React Native Engineer, Senior React Native Engineer, Mobile Engineer, Expo Developer, Product Engineer",
  coreSkills:
    "React Native, TypeScript, Expo, JavaScript, iOS, Android, Mobile Release",
  bonusSkills:
    "GraphQL, Jest, Detox, Fastlane, Native Modules, CI/CD, App Store, Play Store, Performance",
  avoidKeywords:
    "onsite five days, onsite four days, no remote, swift only, kotlin only, native rewrite",
  resumeText: "",
  workAuthorization: ""
};

const RESUME_SKILL_LIBRARY = [
  "react native",
  "expo",
  "expo router",
  "typescript",
  "javascript",
  "react",
  "redux",
  "graphql",
  "apollo",
  "rest",
  "node",
  "firebase",
  "jest",
  "detox",
  "cypress",
  "fastlane",
  "ci/cd",
  "app store",
  "play store",
  "ios",
  "android",
  "swift",
  "swiftui",
  "kotlin",
  "native modules",
  "performance",
  "accessibility",
  "storybook",
  "sentry",
  "amplitude",
  "analytics",
  "release",
  "ota updates"
];

const STATUS_LABELS = {
  saved: "Saved",
  "apply-next": "Apply next",
  applied: "Applied",
  interview: "Interview",
  archived: "Archived"
};

const DEFAULT_DISCOVERY_SETTINGS = {
  autoPullWhenEmpty: false,
  excludeLocations: "",
  fallbackBatchIndex: 0,
  remoteMode: "preferred",
  sourceUrls: []
};

const state = {
  autoPullAttempted: false,
  customJobs: [],
  discovery: { ...DEFAULT_DISCOVERY_SETTINGS },
  importInFlight: false,
  importedJobs: [],
  importReport: null,
  jobs: [],
  profile: { ...DEFAULT_PROFILE },
  selectedJobId: null,
  statuses: {},
  filters: {
    fit: "all",
    search: "",
    source: "all",
    status: "all",
    view: "active"
  }
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  restoreState();
  bindEvents();
  initializeApp();
});

async function initializeApp() {
  state.jobs = await loadSeedJobs();
  elements.importUrls.value = state.discovery.sourceUrls.join("\n");
  if (!state.selectedJobId && allJobs().length > 0) {
    state.selectedJobId = allJobs()[0].id;
  }
  render();
}

function cacheElements() {
  elements.automationSummary = document.querySelector("#automationSummary");
  elements.autoPullToggle = document.querySelector("#autoPullToggle");
  elements.clearImportedJobs = document.querySelector("#clearImportedJobs");
  elements.exportQueue = document.querySelector("#exportQueue");
  elements.excludeLocationsInput = document.querySelector("#excludeLocationsInput");
  elements.filtersForm = document.querySelector("#filtersForm");
  elements.flash = document.querySelector("#flash");
  elements.heroSpotlight = document.querySelector("#heroSpotlight");
  elements.historyList = document.querySelector("#historyList");
  elements.importForm = document.querySelector("#importForm");
  elements.importResults = document.querySelector("#importResults");
  elements.importUrls = document.querySelector("#importUrls");
  elements.jobCount = document.querySelector("#jobCount");
  elements.jobDetail = document.querySelector("#jobDetail");
  elements.jobForm = document.querySelector("#jobForm");
  elements.jobList = document.querySelector("#jobList");
  elements.loadGreenhouseJobs = document.querySelector("#loadGreenhouseJobs");
  elements.loadStarterJobs = document.querySelector("#loadStarterJobs");
  elements.metrics = document.querySelector("#metrics");
  elements.pullMoreJobs = document.querySelector("#pullMoreJobs");
  elements.profileForm = document.querySelector("#profileForm");
  elements.profileSignals = document.querySelector("#profileSignals");
  elements.queueList = document.querySelector("#queueList");
  elements.remoteModeSelect = document.querySelector("#remoteModeSelect");
  elements.resumeFile = document.querySelector("#resumeFile");
  elements.searchRecipes = document.querySelector("#searchRecipes");
  elements.submitImportJobs = elements.importForm.querySelector('button[type="submit"]');
}

function restoreState() {
  state.discovery = {
    ...DEFAULT_DISCOVERY_SETTINGS,
    ...readJson(STORAGE_KEYS.discovery, {})
  };
  state.discovery.fallbackBatchIndex = Number(state.discovery.fallbackBatchIndex || 0) || 0;
  state.discovery.excludeLocations = normalizeExcludedLocationsText(state.discovery.excludeLocations);
  state.discovery.remoteMode = normalizeRemoteMode(state.discovery.remoteMode);
  state.discovery.sourceUrls = normalizeSourceUrls(state.discovery.sourceUrls);
  state.profile = {
    ...DEFAULT_PROFILE,
    ...readJson(STORAGE_KEYS.profile, {})
  };
  state.customJobs = readJson(STORAGE_KEYS.customJobs, []);
  state.importedJobs = readJson(STORAGE_KEYS.importedJobs, []);
  state.statuses = readJson(STORAGE_KEYS.statuses, {});
}

async function loadSeedJobs() {
  try {
    const response = await fetch("./data/jobs.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load jobs: ${response.status}`);
    }
    const jobs = await response.json();
    return jobs.map(normalizeJob);
  } catch (error) {
    console.error(error);
    showFlash("Could not load seeded jobs, but you can still add your own.");
    return [];
  }
}

function bindEvents() {
  elements.autoPullToggle.addEventListener("change", handleAutoPullToggle);
  elements.clearImportedJobs.addEventListener("click", handleClearImportedJobs);
  elements.importForm.addEventListener("submit", handleImportSubmit);
  elements.loadGreenhouseJobs.addEventListener("click", handleLoadGreenhouseJobs);
  elements.loadStarterJobs.addEventListener("click", handleLoadStarterJobs);
  elements.excludeLocationsInput.addEventListener("input", handleExcludeLocationsChange);
  elements.remoteModeSelect.addEventListener("change", handleRemoteModeChange);
  elements.profileForm.addEventListener("input", handleProfileChange);
  elements.filtersForm.addEventListener("input", handleFilterChange);
  elements.historyList.addEventListener("click", handleJobSelection);
  elements.jobForm.addEventListener("submit", handleJobSubmit);
  elements.jobList.addEventListener("click", handleJobSelection);
  elements.queueList.addEventListener("click", handleJobSelection);
  elements.pullMoreJobs.addEventListener("click", handlePullMoreJobs);
  elements.jobDetail.addEventListener("click", handleDetailClick);
  elements.jobDetail.addEventListener("change", handleDetailChange);
  elements.searchRecipes.addEventListener("click", handleRecipeClick);
  elements.exportQueue.addEventListener("click", exportQueue);
  elements.resumeFile.addEventListener("change", handleResumeUpload);
}

function handleProfileChange() {
  const formData = new FormData(elements.profileForm);
  state.profile = {
    answerAgencyExperience: readProfileValue(formData, "answerAgencyExperience", { trim: true }),
    answerAgencyName: readProfileValue(formData, "answerAgencyName"),
    answerEmploymentPreference: readProfileValue(formData, "answerEmploymentPreference", { trim: true }),
    answerHearAbout: readProfileValue(formData, "answerHearAbout", { trim: true }),
    answerHearAboutDetail: readProfileValue(formData, "answerHearAboutDetail"),
    answerPhoneCountry: readProfileValue(formData, "answerPhoneCountry"),
    answerPronouns: readProfileValue(formData, "answerPronouns"),
    answerStartAvailability: readProfileValue(formData, "answerStartAvailability"),
    answerUpcomingCommitments: readProfileValue(formData, "answerUpcomingCommitments"),
    answerUsZipCode: readProfileValue(formData, "answerUsZipCode", { trim: true }),
    currentLocation: readProfileValue(formData, "currentLocation"),
    email: readProfileValue(formData, "email", { trim: true }),
    fullName: readProfileValue(formData, "fullName"),
    phone: readProfileValue(formData, "phone", { trim: true }),
    summary: readProfileValue(formData, "summary"),
    linkedinUrl: readProfileValue(formData, "linkedinUrl", { trim: true }),
    githubUrl: readProfileValue(formData, "githubUrl", { trim: true }),
    portfolioUrl: readProfileValue(formData, "portfolioUrl", { trim: true }),
    resumeFilePath: readProfileValue(formData, "resumeFilePath"),
    salaryFloor: Number(formData.get("salaryFloor") || 0),
    sponsorship: readProfileValue(formData, "sponsorship"),
    targetTitles: readProfileValue(formData, "targetTitles"),
    coreSkills: readProfileValue(formData, "coreSkills"),
    bonusSkills: readProfileValue(formData, "bonusSkills"),
    avoidKeywords: readProfileValue(formData, "avoidKeywords"),
    resumeText: readProfileValue(formData, "resumeText"),
    workAuthorization: readProfileValue(formData, "workAuthorization")
  };
  writeJson(STORAGE_KEYS.profile, state.profile);
  render();
}

function readProfileValue(formData, key, options = {}) {
  const value = String(formData.get(key) || "");
  return options.trim ? value.trim() : value;
}

function handleAutoPullToggle(event) {
  state.discovery.autoPullWhenEmpty = event.target.checked;
  persistDiscoverySettings();
  state.autoPullAttempted = false;
  render();
}

function handleRemoteModeChange(event) {
  state.discovery.remoteMode = normalizeRemoteMode(event.target.value);
  persistDiscoverySettings();
  state.autoPullAttempted = false;
  render();
}

function handleExcludeLocationsChange(event) {
  state.discovery.excludeLocations = normalizeExcludedLocationsText(event.target.value);
  persistDiscoverySettings();
  state.autoPullAttempted = false;
  render();
}

async function handleResumeUpload(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = isPdfFile(file) ? await extractResumeTextFromPdf(file) : await file.text();
    if (!text.trim()) {
      showFlash("That file was empty. Try a text, Markdown, or PDF resume file.");
      return;
    }

    elements.profileForm.resumeText.value = normalizeResumeText(text);
    handleProfileChange();
    showFlash(`Imported resume text from ${file.name}.`);
  } catch (error) {
    console.error(error);
    showFlash(
      error instanceof Error
        ? error.message
        : "Could not read that resume file. Paste the text manually for now."
    );
  } finally {
    event.target.value = "";
  }
}

async function handleImportSubmit(event) {
  event.preventDefault();

  const urls = normalizeSourceUrls(elements.importUrls.value);

  if (urls.length === 0) {
    showFlash("Paste at least one Greenhouse, Lever, Ashby, or direct job URL.");
    return;
  }

  await importLiveJobs(urls);
}

async function handleLoadStarterJobs() {
  state.discovery.fallbackBatchIndex = 0;
  persistDiscoverySettings();
  await importLiveJobs(STARTER_SOURCE_URLS, {
    loadingMessage: "Loading starter live jobs..."
  });
}

async function handleLoadGreenhouseJobs() {
  const result = await importLiveJobs(GREENHOUSE_AUTOFILL_SOURCE_URLS, {
    loadingMessage: "Loading Greenhouse jobs for autofill testing...",
    rememberSources: false,
    suppressResultFlash: true
  });

  if (!result) {
    return;
  }

  state.filters.source = "greenhouse";
  state.filters.status = "all";
  state.filters.view = "all";
  state.filters.search = "";
  render();

  showFlash(
    result.importedCount > 0
      ? `Imported ${result.importedCount} Greenhouse-focused job${
          result.importedCount === 1 ? "" : "s"
        } and switched the board to Greenhouse view.`
      : "Greenhouse import finished. Switched the board to Greenhouse view so you can inspect the current matches."
  );
}

async function handlePullMoreJobs() {
  await importNextDiscoveryBatch({
    loadingMessage: "Pulling more jobs from the next discovery batch..."
  });
}

function handleClearImportedJobs() {
  const customJobIds = new Set(state.customJobs.map((job) => normalizeJob(job).id));
  state.importedJobs = [];
  state.importReport = null;
  state.discovery.fallbackBatchIndex = 0;
  state.statuses = Object.fromEntries(
    Object.entries(state.statuses).filter(([jobId]) => customJobIds.has(jobId))
  );
  writeJson(STORAGE_KEYS.importedJobs, state.importedJobs);
  writeJson(STORAGE_KEYS.statuses, state.statuses);
  persistDiscoverySettings();
  state.autoPullAttempted = false;
  render();
  showFlash("Imported jobs cleared and discovery lead statuses reset.");
}

function handleFilterChange() {
  const formData = new FormData(elements.filtersForm);
  state.filters = {
    fit: String(formData.get("fit") || "all"),
    search: String(formData.get("search") || "").trim().toLowerCase(),
    source: normalizeSourceFilter(formData.get("source")),
    status: String(formData.get("status") || "all"),
    view: normalizeBoardView(formData.get("view"))
  };
  render();
}

function handleJobSubmit(event) {
  event.preventDefault();

  const formData = new FormData(elements.jobForm);
  const title = String(formData.get("title") || "").trim();
  const company = String(formData.get("company") || "").trim();
  const description = String(formData.get("description") || "").trim();

  if (!title || !company || !description) {
    showFlash("Add a title, company, and description so the job can be scored.");
    return;
  }

  const job = normalizeJob({
    company,
    description,
    employmentType: "Custom",
    id: `custom-${Date.now()}`,
    location: String(formData.get("location") || "Not specified").trim(),
    postedAt: new Date().toISOString().slice(0, 10),
    remote: formData.get("remote") === "on",
    salaryMax: Number(formData.get("salaryMax") || 0) || null,
    salaryMin: Number(formData.get("salaryMin") || 0) || null,
    source: "custom",
    title,
    url: String(formData.get("url") || "").trim()
  });

  state.customJobs = [job, ...state.customJobs];
  state.selectedJobId = job.id;
  writeJson(STORAGE_KEYS.customJobs, state.customJobs);
  elements.jobForm.reset();
  showFlash("Job added and scored.");
  render();
}

function handleJobSelection(event) {
  const trigger = event.target.closest("[data-job-id]");
  if (!trigger) {
    return;
  }

  state.selectedJobId = trigger.getAttribute("data-job-id");
  render();
}

function handleDetailClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }

  const action = button.getAttribute("data-action");
  const jobId = button.getAttribute("data-job-id");
  const analyzedJob = analyzedJobs().find((job) => job.id === jobId);

  if (!analyzedJob) {
    return;
  }

  if (action === "copy-pitch") {
    const pitchText = analyzedJob.pitch.map((item) => `- ${item}`).join("\n");
    navigator.clipboard
      .writeText(pitchText)
      .then(() => showFlash("Tailored pitch copied."))
      .catch(() => showFlash("Clipboard copy was blocked by the browser."));
  }

  if (action === "open-job" && analyzedJob.url && !isSampleJob(analyzedJob)) {
    window.open(analyzedJob.url, "_blank", "noopener,noreferrer");
  }
}

function handleDetailChange(event) {
  const select = event.target.closest("[data-status-select]");
  if (!select) {
    return;
  }

  const jobId = select.getAttribute("data-status-select");
  state.statuses[jobId] = select.value;
  writeJson(STORAGE_KEYS.statuses, state.statuses);
  render();
}

function handleRecipeClick(event) {
  const button = event.target.closest("[data-recipe-url]");
  if (!button) {
    return;
  }

  const url = button.getAttribute("data-recipe-url");
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function render() {
  hydrateForms();
  syncImportControls();
  renderProfileSignals();
  renderImportResults();
  renderSearchRecipes();
  renderSnapshot();
  renderHistoryList();
  renderJobList();
  renderJobDetail();
  scheduleAutoPullCheck();
}

function hydrateForms() {
  elements.autoPullToggle.checked = state.discovery.autoPullWhenEmpty;
  elements.excludeLocationsInput.value = state.discovery.excludeLocations;
  elements.remoteModeSelect.value = state.discovery.remoteMode;
  elements.filtersForm.view.value = normalizeBoardView(state.filters.view);
  elements.profileForm.answerAgencyExperience.value = state.profile.answerAgencyExperience;
  elements.profileForm.answerAgencyName.value = state.profile.answerAgencyName;
  elements.profileForm.answerEmploymentPreference.value = state.profile.answerEmploymentPreference;
  elements.profileForm.answerHearAbout.value = state.profile.answerHearAbout;
  elements.profileForm.answerHearAboutDetail.value = state.profile.answerHearAboutDetail;
  elements.profileForm.answerPhoneCountry.value = state.profile.answerPhoneCountry;
  elements.profileForm.answerPronouns.value = state.profile.answerPronouns;
  elements.profileForm.answerStartAvailability.value = state.profile.answerStartAvailability;
  elements.profileForm.answerUpcomingCommitments.value = state.profile.answerUpcomingCommitments;
  elements.profileForm.answerUsZipCode.value = state.profile.answerUsZipCode;
  elements.profileForm.currentLocation.value = state.profile.currentLocation;
  elements.profileForm.email.value = state.profile.email;
  elements.profileForm.fullName.value = state.profile.fullName;
  elements.profileForm.phone.value = state.profile.phone;
  elements.profileForm.summary.value = state.profile.summary;
  elements.profileForm.linkedinUrl.value = state.profile.linkedinUrl;
  elements.profileForm.githubUrl.value = state.profile.githubUrl;
  elements.profileForm.portfolioUrl.value = state.profile.portfolioUrl;
  elements.profileForm.resumeFilePath.value = state.profile.resumeFilePath;
  elements.profileForm.salaryFloor.value = state.profile.salaryFloor;
  elements.profileForm.sponsorship.value = state.profile.sponsorship;
  elements.profileForm.targetTitles.value = state.profile.targetTitles;
  elements.profileForm.coreSkills.value = state.profile.coreSkills;
  elements.profileForm.bonusSkills.value = state.profile.bonusSkills;
  elements.profileForm.avoidKeywords.value = state.profile.avoidKeywords;
  elements.profileForm.resumeText.value = state.profile.resumeText;
  elements.profileForm.workAuthorization.value = state.profile.workAuthorization;

  elements.filtersForm.fit.value = state.filters.fit;
  elements.filtersForm.source.value = normalizeSourceFilter(state.filters.source);
  elements.filtersForm.status.value = state.filters.status;
  elements.filtersForm.search.value = state.filters.search;
}

function renderSearchRecipes() {
  const targetTitles = splitList(state.profile.targetTitles);
  const primaryTitle = targetTitles[0] || "React Native Engineer";
  const secondTitle = targetTitles[1] || "Expo Developer";
  const skills = splitList(state.profile.coreSkills);
  const resumeSignals = getResumeSignals(state.profile);
  const searchSkills = uniqueList([...skills, ...resumeSignals.skills]).slice(0, 4);
  const skillTerms =
    searchSkills.length > 0
      ? searchSkills.map((skill) => `"${skill}"`).join(" OR ")
      : `"react native" OR "typescript"`;

  const recipes = [
    {
      title: "LinkedIn live search",
      query: `${primaryTitle} OR ${secondTitle} remote`,
      url: `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(`${primaryTitle} ${secondTitle} remote`)}`
    },
    {
      title: "Greenhouse sweep",
      query: `site:boards.greenhouse.io "react native" ${skillTerms} remote`,
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `site:boards.greenhouse.io "react native" ${skillTerms} remote`
      )}`
    },
    {
      title: "Lever sweep",
      query: `site:jobs.lever.co "react native" "typescript" remote`,
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `site:jobs.lever.co "react native" "typescript" remote`
      )}`
    },
    {
      title: "Broad discovery",
      query: `("react native" OR expo) "${searchSkills[0] || "typescript"}" salary mobile`,
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `("react native" OR expo) "${searchSkills[0] || "typescript"}" salary mobile`
      )}`
    }
  ];

  if (resumeSignals.skills.length > 0) {
    recipes.unshift({
      title: "Resume-derived sweep",
      query: `"react native" ${resumeSignals.skills
        .slice(0, 3)
        .map((skill) => `"${skill}"`)
        .join(" OR ")} remote`,
      url: `https://www.google.com/search?q=${encodeURIComponent(
        `"react native" ${resumeSignals.skills
          .slice(0, 3)
          .map((skill) => `"${skill}"`)
          .join(" OR ")} remote`
      )}`
    });
  }

  elements.searchRecipes.innerHTML = recipes
    .map(
      (recipe) => `
        <article class="recipe-card">
          <h3>${escapeHtml(recipe.title)}</h3>
          <p class="muted">Built from your titles, skills, and resume signals.</p>
          <code>${escapeHtml(recipe.query)}</code>
          <div class="recipe-actions">
            <button class="button primary" type="button" data-recipe-url="${escapeHtml(
              recipe.url
            )}">Open search</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderProfileSignals() {
  const links = publicProfileLinks(state.profile);
  const resumeSignals = getResumeSignals(state.profile);
  const hasResume = state.profile.resumeText.trim().length > 0;

  elements.profileSignals.innerHTML = `
    <div class="profile-signal-grid">
      <article class="detail-card">
        <h4>Candidate assets</h4>
        ${
          links.length > 0
            ? `<div class="link-row">
                ${links
                  .map(
                    (link) => `
                      <a class="link-chip" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">
                        ${escapeHtml(link.label)}
                      </a>
                    `
                  )
                  .join("")}
              </div>`
            : `<p class="muted">Add LinkedIn, GitHub, or portfolio links here so they are part of your application kit.</p>`
        }
        <p class="mini-note">Everything in this profile is stored locally in this browser.</p>
      </article>

      <article class="detail-card">
        <h4>Resume signals</h4>
        ${
          resumeSignals.skills.length > 0
            ? `
                <div class="chip-row">
                  ${resumeSignals.skills
                    .slice(0, 10)
                    .map((skill) => `<span class="chip">${escapeHtml(skill)}</span>`)
                    .join("")}
                </div>
                <p class="mini-note">These keywords now influence scoring and the generated search recipes.</p>
              `
            : `<p class="muted">${
                hasResume
                  ? "The resume is stored, but no recognizable skills were extracted yet."
                  : "Paste your resume and the app will pull extra skills into the match engine."
              }</p>`
        }
      </article>
    </div>
  `;
}

function renderImportResults() {
  const importedCount = state.importedJobs.length;
  const report = state.importReport;
  const sampleCount = state.jobs.filter((job) => isSampleJob(job)).length;
  const savedSourceCount = state.discovery.sourceUrls.length;
  const nextBatchNumber = normalizeBatchIndex(state.discovery.fallbackBatchIndex) + 1;
  const excludedLocations = normalizeExcludedLocations(state.discovery.excludeLocations);

  elements.importResults.innerHTML = `
    <div class="profile-signal-grid">
      <article class="detail-card">
        <h4>Imported leads</h4>
        <p class="mini-note">
          ${importedCount} imported role${importedCount === 1 ? "" : "s"} currently live in your board.
        </p>
        ${
          importedCount > 0
            ? `<div class="chip-row">
                ${summarizeImportedSources(state.importedJobs)
                  .map((item) => `<span class="chip">${escapeHtml(item)}</span>`)
                  .join("")}
              </div>`
            : `<p class="muted">${
                sampleCount > 0
                  ? `You are still looking at ${sampleCount} starter sample role${sampleCount === 1 ? "" : "s"}. Load starter jobs or paste source URLs to replace the example links with live postings.`
                  : "Import a Greenhouse, Lever, or Ashby board to bring live roles into the board."
              }</p>`
        }
        <p class="mini-note">${
          savedSourceCount > 0
            ? `${savedSourceCount} saved source${savedSourceCount === 1 ? "" : "s"} are ready for exact imports from the textarea. Pull more jobs will rotate to curated discovery batch ${nextBatchNumber}.`
            : `Pull more jobs will rotate to curated discovery batch ${nextBatchNumber}.`
        }</p>
        <p class="mini-note">Discovery mode: ${escapeHtml(humanizeRemoteMode(state.discovery.remoteMode))}. Each pull fans out across a broader ATS source pool and skips to the next batch when a batch adds nothing new.</p>
        <p class="mini-note">${
          excludedLocations.length > 0
            ? `Excluded locations: ${escapeHtml(excludedLocations.join(", "))}.`
            : "No location exclusions are active."
        }</p>
      </article>

      <article class="detail-card">
        <h4>Last import</h4>
        ${
          report
            ? `
                <p class="mini-note">
                  Found ${report.totalFound} matching role${report.totalFound === 1 ? "" : "s"}, kept ${report.keptCount} after ${escapeHtml(
                    humanizeRemoteMode(report.remoteMode)
                  ).toLowerCase()}, and added ${report.importedCount} new one${
                    report.importedCount === 1 ? "" : "s"
                  } after dedupe.
                </p>
                <p class="mini-note">
                  ${report.activeCount} landed in Ranked Leads, ${report.queuedCount} moved into Apply next, and ${report.referenceCount} landed in the Reference Shelf.
                </p>
                <p class="mini-note">
                  ${report.remoteCount} of the kept role${report.remoteCount === 1 ? "" : "s"} were marked remote-friendly.
                </p>
                <p class="mini-note">
                  ${report.excludedLocationCount} role${report.excludedLocationCount === 1 ? "" : "s"} were filtered out by your excluded locations.
                </p>
                ${
                  report.sources.length > 0
                    ? `<div class="chip-row">
                        ${report.sources
                          .map(
                            (source) =>
                              `<span class="chip">${escapeHtml(humanizeLabel(source.sourceType))}: ${source.importedCount}</span>`
                          )
                          .join("")}
                      </div>`
                    : ""
                }
                ${
                  report.errors.length > 0
                    ? `<ul class="inline-list">
                        ${report.errors
                          .slice(0, 4)
                          .map(
                            (error) =>
                              `<li>${escapeHtml(error.input)}: ${escapeHtml(error.error)}</li>`
                          )
                        .join("")}
                      </ul>`
                    : `<p class="muted">No source errors on the last import.</p>`
                }
              `
            : `<p class="muted">No live import has run yet in this session.</p>`
        }
        <p class="mini-note">${
          state.discovery.autoPullWhenEmpty
            ? "Auto-pull is on. If your active leads hit zero, the app will fetch another batch once."
            : "Auto-pull is off. Turn it on if you want the app to fetch another batch when active leads run out."
        }</p>
      </article>
    </div>
  `;
}

async function extractResumeTextFromPdf(file) {
  showFlash(`Extracting resume text from ${file.name}...`);

  const response = await fetch("/api/extract-pdf-text", {
    body: file,
    headers: {
      "Content-Type": "application/pdf"
    },
    method: "POST"
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Could not extract text from that PDF.");
  }

  return String(payload.text || "");
}

function renderSnapshot() {
  const jobs = activeLeadJobs();
  const applyQueue = buildApplyQueue(analyzedJobs());
  const strongFits = jobs.filter((job) => job.fitBucket === "strong").length;
  const remoteFits = jobs.filter((job) => job.remote).length;
  const applyNext = applyQueue.length;
  const sampleOnlyMode = jobs.length > 0 && jobs.every((job) => isSampleJob(job));
  const averageScore =
    jobs.length > 0
      ? Math.round(jobs.reduce((sum, job) => sum + job.score, 0) / jobs.length)
      : 0;

  elements.metrics.innerHTML = [
    createMetricCard("Strong fits", strongFits),
    createMetricCard("Remote-friendly", remoteFits),
    createMetricCard("Apply next", applyNext),
    createMetricCard("Average score", averageScore)
  ].join("");

  elements.queueList.innerHTML =
    applyQueue.length > 0
      ? applyQueue
          .map(
            (job) => `
              <button class="queue-item" type="button" data-job-id="${escapeHtml(job.id)}">
                <div>
                  <strong>${escapeHtml(job.title)}</strong>
                  <p>${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p>
                </div>
                <span class="pill ${fitClass(job.fitBucket)}">${escapeHtml(
                  fitLabel(job.fitBucket)
                )} · ${job.score}</span>
              </button>
            `
          )
          .join("")
      : `<div class="detail-card"><p class="muted">Mark interesting roles as "Apply next" to move them out of Ranked Leads and into this queue.</p></div>`;

  elements.automationSummary.innerHTML = buildAutomationSummary(applyQueue);

  const spotlightJob = applyQueue[0] || jobs[0];
  elements.heroSpotlight.innerHTML = spotlightJob
    ? `
        <span class="spotlight-kicker">Best current fit</span>
        <div class="spotlight-title">${escapeHtml(spotlightJob.title)}</div>
        <div class="spotlight-meta">${escapeHtml(spotlightJob.company)} · ${escapeHtml(
          spotlightJob.location
        )}</div>
        <div class="spotlight-row">
          <span class="pill ${fitClass(spotlightJob.fitBucket)}">${escapeHtml(
            fitLabel(spotlightJob.fitBucket)
          )}</span>
          <span class="pill">${spotlightJob.score} / 100</span>
          <span class="pill">${escapeHtml(currentStatusLabel(spotlightJob.id))}</span>
        </div>
        <p class="muted">${escapeHtml(spotlightJob.reasons.slice(0, 2).join(" · "))}</p>
        ${
          sampleOnlyMode
            ? `<p class="mini-note">These are starter sample leads for scoring only. Use the Import Jobs panel to pull in live postings with real URLs.</p>`
            : ""
        }
      `
    : `
        <span class="spotlight-kicker">Ready when you are</span>
        <div class="spotlight-title">Add a job lead</div>
        <p class="muted">Paste a posting on the left and the board will score it against your React Native lens.</p>
      `;
}

function renderHistoryList() {
  const appliedJobs = historyJobs("applied");
  const archivedJobs = historyJobs("archived");
  const totalCount = appliedJobs.length + archivedJobs.length;

  elements.historyList.innerHTML =
    totalCount > 0
      ? `
          <div class="history-groups">
            ${renderHistoryGroup("Applied", appliedJobs, "Applied jobs will collect here for quick follow-up reference.")}
            ${renderHistoryGroup("Archived", archivedJobs, "Archived jobs will collect here when you want to keep them out of the active board.")}
          </div>
        `
      : `<div class="detail-card"><p class="muted">Jobs marked as Applied or Archived will collect here so you can reference them without crowding the active board.</p></div>`;
}

function renderHistoryGroup(title, jobs, emptyMessage) {
  return `
    <article class="detail-card history-group">
      <div class="history-group-head">
        <div>
          <h4>${escapeHtml(title)}</h4>
          <p class="muted">${jobs.length} role${jobs.length === 1 ? "" : "s"}</p>
        </div>
      </div>
      <div class="history-scroller">
        ${
          jobs.length > 0
            ? jobs
                .map(
                  (job) => `
                    <button class="queue-item history-item" type="button" data-job-id="${escapeHtml(job.id)}">
                      <div>
                        <strong>${escapeHtml(job.title)}</strong>
                        <p>${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p>
                      </div>
                      <div class="history-meta">
                        <span class="chip">${escapeHtml(currentStatusLabel(job.id))}</span>
                        <span class="pill ${fitClass(job.fitBucket)}">${escapeHtml(
                          fitLabel(job.fitBucket)
                        )} · ${job.score}</span>
                      </div>
                    </button>
                  `
                )
                .join("")
            : `<div class="history-empty"><p class="muted">${escapeHtml(emptyMessage)}</p></div>`
        }
      </div>
    </article>
  `;
}

function renderJobList() {
  const jobs = filteredJobs();
  const referenceCount = historyJobs().length;
  const stats = boardStats();
  const preserveSelection = analyzedJobs().some(
    (job) => job.id === state.selectedJobId && isReferenceStatus(currentStatus(job.id))
  );

  if (!preserveSelection && !jobs.some((job) => job.id === state.selectedJobId) && jobs[0]) {
    state.selectedJobId = jobs[0].id;
  }

  elements.jobCount.textContent = `${jobs.length} shown · ${stats.activeCount} active · ${stats.queueCount} in Apply next · ${stats.referenceCount} reference · ${stats.totalCount} total`;
  elements.jobList.innerHTML =
    jobs.length > 0
      ? jobs
          .map(
            (job) => `
              <button
                class="job-card ${job.id === state.selectedJobId ? "is-selected" : ""}"
                type="button"
                data-job-id="${escapeHtml(job.id)}"
              >
                <div class="job-card-top">
                  <span class="pill ${fitClass(job.fitBucket)}">${escapeHtml(
                    fitLabel(job.fitBucket)
                  )}</span>
                  <span class="score">${job.score} / 100</span>
                </div>
                <h3>${escapeHtml(job.title)}</h3>
                <p class="job-meta">${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p>
                <div class="chip-row">
                  <span class="chip">${escapeHtml(job.sourceLabel || job.source)}</span>
                  ${isSampleJob(job) ? `<span class="chip">Sample only</span>` : ""}
                  ${job.skills
                    .slice(0, 3)
                    .map((skill) => `<span class="chip">${escapeHtml(skill)}</span>`)
                    .join("")}
                </div>
                <div class="job-meta-row">
                  <p class="job-summary">${escapeHtml(job.reasons.slice(0, 2).join(" · "))}</p>
                </div>
              </button>
            `
          )
          .join("")
      : `<div class="empty-state">${emptyBoardMessage(referenceCount)}</div>`;
}

function renderJobDetail() {
  const job = analyzedJobs().find((entry) => entry.id === state.selectedJobId);
  if (!job) {
    elements.jobDetail.className = "job-detail empty-state";
    elements.jobDetail.textContent =
      "Select a job to see the fit breakdown, custom pitch, and next application move.";
    return;
  }

  elements.jobDetail.className = "job-detail";
  elements.jobDetail.innerHTML = `
    <div class="detail-subhead">
      <div>
        <h3>${escapeHtml(job.title)}</h3>
        <p class="job-meta">${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p>
      </div>
      <span class="pill ${fitClass(job.fitBucket)}">${escapeHtml(fitLabel(job.fitBucket))} · ${
        job.score
      }</span>
    </div>

    <div class="detail-actions">
      <div class="chip-row">
        <span class="chip">${escapeHtml(job.employmentType || "Unknown type")}</span>
        <span class="chip">${job.remote ? "Remote-friendly" : "Location-bound"}</span>
        <span class="chip">${escapeHtml(salaryLabel(job))}</span>
        <span class="chip">${escapeHtml(job.sourceLabel || job.source)}</span>
      </div>
      <div class="chip-row">
        ${
          job.url && !isSampleJob(job)
            ? `<button class="button primary" type="button" data-action="open-job" data-job-id="${escapeHtml(
                job.id
              )}">Open posting</button>`
            : job.url
              ? `<button class="button ghost" type="button" disabled>Sample link only</button>`
              : ""
        }
        <button class="button ghost" type="button" data-action="copy-pitch" data-job-id="${escapeHtml(
          job.id
        )}">Copy pitch</button>
      </div>
    </div>

    <div class="detail-block">
      <div class="detail-card">
        <div class="status-row">
          <label>
            <span>Status</span>
            <select data-status-select="${escapeHtml(job.id)}">
              ${Object.entries(STATUS_LABELS)
                .map(
                  ([value, label]) => `
                    <option value="${value}" ${currentStatus(job.id) === value ? "selected" : ""}>
                      ${escapeHtml(label)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>
          <label>
            <span>Posted</span>
            <input value="${escapeHtml(prettyDate(job.postedAt))}" type="text" readonly />
          </label>
        </div>
        ${
          isReferenceStatus(currentStatus(job.id))
            ? `<p class="mini-note">This lead now lives in your Reference Shelf because its status is ${escapeHtml(
                currentStatusLabel(job.id)
              )}.</p>`
            : isSampleJob(job)
            ? `<p class="mini-note">This is starter sample data for scoring and workflow testing. Load live jobs to get real posting URLs.</p>`
            : job.sourceUrl || job.importedFrom
              ? `<p class="mini-note">
                Imported from
                <a href="${escapeHtml(job.importedFrom || job.sourceUrl)}" target="_blank" rel="noopener noreferrer">
                  ${escapeHtml(job.importedFrom || job.sourceUrl)}
                </a>
              </p>`
              : ""
        }
      </div>

      <div class="detail-card">
        <h4>Why it fits</h4>
        <ul>
          ${job.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
      </div>

      <div class="detail-card">
        <h4>Risks and questions</h4>
        <ul>
          ${job.concerns.map((concern) => `<li>${escapeHtml(concern)}</li>`).join("")}
        </ul>
      </div>

      <div class="detail-card">
        <h4>Tailored pitch</h4>
        <ul>
          ${job.pitch.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>

      <div class="detail-card">
        <h4>Resume focus</h4>
        <ul>
          ${job.resumeFocus.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>

      ${renderCandidateAssetsCard(job)}

      <div class="detail-card">
        <h4>Posting summary</h4>
        <p class="job-summary">${escapeHtml(job.description)}</p>
      </div>
    </div>
  `;
}

function analyzedJobs() {
  return allJobs()
    .map((job) => analyzeJob(job, state.profile))
    .sort((left, right) => right.score - left.score || right.postedAt.localeCompare(left.postedAt));
}

function filteredJobs() {
  const normalizedView = normalizeBoardView(state.filters.view);
  const baseJobs =
    state.filters.status === "apply-next"
      ? buildApplyQueue(analyzedJobs())
      : normalizedView === "all"
        ? analyzedJobs()
        : normalizedView === "reference" || state.filters.status === "applied" || state.filters.status === "archived"
          ? historyJobs()
          : activeLeadJobs();

  return baseJobs.filter((job) => {
    const status = currentStatus(job.id);
    const haystack = `${job.title} ${job.company} ${job.description} ${job.skills.join(" ")}`.toLowerCase();
    const matchesFit = state.filters.fit === "all" || job.fitBucket === state.filters.fit;
    const matchesSource = state.filters.source === "all" || job.source === state.filters.source;
    const matchesStatus = state.filters.status === "all" || status === state.filters.status;
    const matchesSearch = !state.filters.search || haystack.includes(state.filters.search);
    return matchesFit && matchesSource && matchesStatus && matchesSearch;
  });
}

function buildApplyQueue(jobs) {
  return jobs.filter((job) => currentStatus(job.id) === "apply-next");
}

function normalizeBoardView(value) {
  return ["active", "all", "reference"].includes(String(value || "").trim())
    ? String(value).trim()
    : "active";
}

function normalizeSourceFilter(value) {
  return ["all", "greenhouse", "lever", "ashby"].includes(String(value || "").trim())
    ? String(value).trim()
    : "all";
}

function boardStats() {
  return {
    activeCount: activeLeadJobs().length,
    queueCount: buildApplyQueue(analyzedJobs()).length,
    referenceCount: historyJobs().length,
    totalCount: analyzedJobs().length
  };
}

function emptyBoardMessage(referenceCount) {
  const normalizedView = normalizeBoardView(state.filters.view);
  const sourceFilter = normalizeSourceFilter(state.filters.source);

  if (state.filters.status === "apply-next") {
    return "No Apply next roles match these filters right now.";
  }

  if (sourceFilter !== "all") {
    return `No ${humanizeLabel(sourceFilter)} roles match these filters right now. Try All sources or pull a fresh batch.`;
  }

  if (normalizedView === "all") {
    return "No synced roles match these filters right now. Loosen the filters or refresh the discovery pool.";
  }

  if (normalizedView === "reference") {
    return "No reference roles match these filters right now.";
  }

  return referenceCount > 0
    ? "No active leads match these filters right now. Check All synced roles or the Reference Shelf."
    : "Nothing matches these filters yet. Loosen the fit filter or add a new lead.";
}

function activeLeadJobs() {
  const jobs = analyzedJobs().filter(
    (job) => !isReferenceStatus(currentStatus(job.id)) && currentStatus(job.id) !== "apply-next"
  );

  if (jobs.length > 0) {
    state.autoPullAttempted = false;
  }

  return jobs;
}

function historyJobs(status = "") {
  return analyzedJobs()
    .filter((job) => status ? currentStatus(job.id) === status : isReferenceStatus(currentStatus(job.id)))
    .sort((left, right) => right.postedAt.localeCompare(left.postedAt) || right.score - left.score);
}

function analyzeJob(job, profile) {
  const titleText = job.title.toLowerCase();
  const blob = `${job.title} ${job.company} ${job.location} ${job.description} ${job.skills.join(" ")}`.toLowerCase();
  const targetTitles = splitList(profile.targetTitles);
  const coreSkills = splitList(profile.coreSkills);
  const bonusSkills = splitList(profile.bonusSkills);
  const avoidKeywords = splitList(profile.avoidKeywords);
  const resumeSignals = getResumeSignals(profile);

  let score = 0;
  const reasons = [];
  const concerns = [];
  const matchedSkills = [];

  if (titleText.includes("react native")) {
    score += 28;
    reasons.push("The title is explicitly React Native.");
  } else if (titleText.includes("expo")) {
    score += 24;
    reasons.push("The role is directly aligned with Expo work.");
  } else if (titleText.includes("mobile")) {
    score += 12;
    reasons.push("The title is mobile-focused.");
  }

  if (targetTitles.some((title) => title && titleText.includes(title))) {
    score += 16;
    reasons.push("The title overlaps with your target role list.");
  }

  const coreHits = coreSkills.filter((skill) => skill && blob.includes(skill));
  const bonusHits = bonusSkills.filter((skill) => skill && blob.includes(skill));
  const resumeSignalHits = resumeSignals.skills.filter((skill) => skill && blob.includes(skill));
  const resumeOnlyHits = resumeSignalHits.filter(
    (skill) => !coreHits.includes(skill) && !bonusHits.includes(skill)
  );

  coreHits.slice(0, 6).forEach((skill) => {
    score += 7;
    matchedSkills.push(skill);
  });

  bonusHits.slice(0, 4).forEach((skill) => {
    score += 3;
    matchedSkills.push(skill);
  });

  resumeOnlyHits.slice(0, 4).forEach((skill) => {
    score += 4;
    matchedSkills.push(skill);
  });

  if (coreHits.length >= 3) {
    reasons.push(`It mentions ${coreHits.slice(0, 3).join(", ")}.`);
  }

  if (resumeOnlyHits.length >= 2) {
    reasons.push(`It overlaps with your resume in ${resumeOnlyHits.slice(0, 3).join(", ")}.`);
  }

  if (job.remote || blob.includes("remote")) {
    score += 8;
    reasons.push("The posting looks remote-friendly.");
  } else {
    concerns.push("It is not clearly remote-friendly.");
    score -= 6;
  }

  if (job.salaryMax && job.salaryMax >= Number(profile.salaryFloor || 0)) {
    score += 10;
    reasons.push("The top of the range clears your salary floor.");
  } else if (job.salaryMax && Number(profile.salaryFloor || 0) > 0) {
    concerns.push("The salary range may sit below your floor.");
    score -= 8;
  }

  avoidKeywords.forEach((keyword) => {
    if (keyword && blob.includes(keyword)) {
      concerns.push(`Matched one of your avoid phrases: "${keyword}".`);
      score -= 12;
    }
  });

  if ((blob.includes("swift") || blob.includes("swiftui")) && !blob.includes("react native")) {
    concerns.push("This reads more native iOS than cross-platform React Native.");
    score -= 14;
  }

  if (blob.includes("kotlin") && !blob.includes("react native")) {
    concerns.push("Android-native expectations look stronger than React Native needs.");
    score -= 12;
  }

  if (blob.includes("onsite") && !job.remote) {
    concerns.push("The role appears to expect regular onsite presence.");
    score -= 10;
  }

  if (blob.includes("contract")) {
    concerns.push("This looks like contract work, so check rate and duration fit.");
  }

  if (reasons.length === 0) {
    reasons.push("It has partial mobile overlap but needs a closer read.");
  }

  if (concerns.length === 0) {
    concerns.push("No major red flags from the quick scan.");
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  const fitBucket =
    boundedScore >= 78 ? "strong" : boundedScore >= 62 ? "worth" : boundedScore >= 45 ? "stretch" : "skip";

  return {
    ...job,
    concerns: concerns.slice(0, 4),
    fitBucket,
    matchedSkills,
    pitch: createPitch(job, matchedSkills, reasons, profile, resumeOnlyHits),
    resumeFocus: createResumeFocus(job, coreHits, bonusHits, profile, resumeOnlyHits),
    reasons: reasons.slice(0, 4),
    resumeSignalHits: resumeSignalHits.slice(0, 6),
    score: boundedScore
  };
}

function createPitch(job, matchedSkills, reasons, profile, resumeOnlyHits) {
  const skillLead = matchedSkills.slice(0, 3).join(", ") || "mobile product delivery";
  const fitSignal = reasons[0] || "There is meaningful mobile overlap here.";
  const profileAssets = publicProfileLinks(profile);
  const assetLine =
    profileAssets.length > 0
      ? `I can back that story up with concrete examples from my ${profileAssets
          .slice(0, 2)
          .map((asset) => asset.label.toLowerCase())
          .join(" and ")}.`
      : "I can point to concrete examples of shipped mobile work during the application process.";

  return [
    `My background lines up well with this role because I have hands-on experience with ${skillLead}.`,
    resumeOnlyHits.length > 0
      ? `My resume also shows relevant experience in ${resumeOnlyHits.slice(0, 2).join(
          " and "
        )}, which strengthens the fit for this role.`
      : `I can help move quickly on cross-platform product work while keeping release quality high across iOS and Android.`,
    assetLine,
    `${fitSignal.replace(/\.$/, "")}, which makes this a strong conversation starter for my React Native background.`
  ].slice(0, 4);
}

function createResumeFocus(job, coreHits, bonusHits, profile, resumeOnlyHits) {
  const focus = [];

  if (coreHits.includes("react native") || job.title.toLowerCase().includes("react native")) {
    focus.push("Lead with React Native product wins and cross-platform ownership.");
  }

  if (coreHits.includes("expo") || bonusHits.includes("expo")) {
    focus.push("Call out Expo workflows, OTA updates, and release velocity improvements.");
  }

  if (coreHits.includes("typescript")) {
    focus.push("Highlight TypeScript architecture and maintainability work.");
  }

  if (bonusHits.includes("ci/cd") || bonusHits.includes("fastlane")) {
    focus.push("Mention build pipelines, release automation, and store submission experience.");
  }

  if (bonusHits.includes("jest") || bonusHits.includes("detox")) {
    focus.push("Show concrete testing coverage gains and mobile QA reliability work.");
  }

  if ((profile.githubUrl || profile.portfolioUrl) && (resumeOnlyHits[0] || coreHits[0] || bonusHits[0])) {
    focus.push(
      `Link to a GitHub or portfolio example that shows ${
        resumeOnlyHits[0] || coreHits[0] || bonusHits[0]
      } in real work.`
    );
  }

  if (focus.length === 0) {
    focus.push("Emphasize mobile product ownership, collaboration, and shipping cadence.");
  }

  return focus.slice(0, 4);
}

function buildApplicationKit() {
  const queuedJobs = buildApplyQueue(analyzedJobs());
  const candidate = buildCandidateProfile(state.profile);
  const warnings = automationProfileWarnings(state.profile);

  return {
    automation: {
      generatedBy: "job-optimizer",
      generatedFromStatus: "apply-next",
      reviewMode: "pause-before-submit",
      supportedAdapters: ["greenhouse"],
      unsupportedAdapters: ["lever", "ashby", "generic"],
      warnings
    },
    candidate,
    exportedAt: new Date().toISOString(),
    jobs: queuedJobs.map((job) => buildApplicationKitJob(job, candidate))
  };
}

function buildApplicationKitJob(job, candidate) {
  const automation = applicationAutomationForJob(job);

  return {
    automation,
    company: job.company,
    concerns: job.concerns,
    fit: fitLabel(job.fitBucket),
    id: job.id,
    location: job.location,
    pitch: job.pitch,
    resumeFocus: job.resumeFocus,
    score: job.score,
    source: job.source,
    sourceLabel: job.sourceLabel,
    status: currentStatusLabel(job.id),
    title: job.title,
    url: job.url || "",
    autofillDefaults: {
      applicationAnswers: candidate.applicationAnswers,
      currentLocation: candidate.currentLocation,
      email: candidate.email,
      firstName: candidate.firstName,
      fullName: candidate.fullName,
      githubUrl: candidate.githubUrl,
      lastName: candidate.lastName,
      linkedinUrl: candidate.linkedinUrl,
      phone: candidate.phone,
      phoneCountry: candidate.phoneCountry,
      portfolioUrl: candidate.portfolioUrl,
      resumeFilePath: candidate.resumeFilePath,
      sponsorship: candidate.sponsorship,
      workAuthorization: candidate.workAuthorization
    }
  };
}

function buildCandidateProfile(profile) {
  const { firstName, lastName } = splitFullName(profile.fullName);
  const phoneCountry = normalizePhoneCountry(profile);
  const hearAbout = String(profile.answerHearAbout || "").trim();

  return {
    applicationAnswers: {
      agencyExperience: profile.answerAgencyExperience,
      agencyName: profile.answerAgencyName,
      employmentPreference: profile.answerEmploymentPreference,
      hearAbout,
      hearAboutDetail: deriveHearAboutDetail(hearAbout, profile.answerHearAboutDetail),
      pronouns: profile.answerPronouns,
      startAvailability: profile.answerStartAvailability,
      upcomingCommitments: defaultUpcomingCommitments(profile.answerUpcomingCommitments),
      usZipCode: profile.answerUsZipCode
    },
    currentLocation: profile.currentLocation,
    email: profile.email,
    firstName,
    fullName: profile.fullName,
    githubUrl: normalizeUrl(profile.githubUrl),
    lastName,
    linkedinUrl: normalizeUrl(profile.linkedinUrl),
    phone: profile.phone,
    phoneCountry,
    portfolioUrl: normalizeUrl(profile.portfolioUrl),
    resumeFilePath: sanitizeResumeFilePath(profile.resumeFilePath),
    resumeSignals: getResumeSignals(profile).skills,
    sponsorship: profile.sponsorship,
    summary: profile.summary,
    workAuthorization: profile.workAuthorization
  };
}

function splitFullName(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

function applicationAutomationForJob(job) {
  if (job.source === "greenhouse" || /greenhouse/i.test(job.url || "")) {
    return {
      adapter: "greenhouse",
      supported: true
    };
  }

  if (job.source === "lever" || /lever\.co/i.test(job.url || "")) {
    return {
      adapter: "lever",
      supported: false
    };
  }

  if (job.source === "ashby" || /ashbyhq/i.test(job.url || "")) {
    return {
      adapter: "ashby",
      supported: false
    };
  }

  return {
    adapter: "generic",
    supported: false
  };
}

function buildAutomationSummary(applyQueue) {
  const adapterBreakdown = applyQueue.map((job) => ({
    automation: applicationAutomationForJob(job),
    job
  }));
  const readyJobs = adapterBreakdown.filter(({ automation }) => automation.supported);
  const greenhouseReadyCount = readyJobs.filter(({ automation }) => automation.adapter === "greenhouse").length;
  const unsupportedCount = adapterBreakdown.length - readyJobs.length;
  const missingBasics = missingAutomationFields(state.profile, [
    ["fullName", "full name"],
    ["email", "email"]
  ]);
  const missingRecommended = missingAutomationFields(state.profile, [
    ["phone", "phone"],
    ["currentLocation", "current location"],
    ["workAuthorization", "work authorization"],
    ["sponsorship", "sponsorship note"],
    ["resumeFilePath", "resume file path"]
  ]);
  const adapterChips = summarizeAutomationAdapters(adapterBreakdown);
  const warnings = automationProfileWarnings(state.profile);

  return `
    <div class="profile-signal-grid">
      <article class="detail-card">
        <h4>Automation readiness</h4>
        <p class="mini-note">${
          applyQueue.length > 0
            ? `${greenhouseReadyCount} Apply next role${
                greenhouseReadyCount === 1 ? "" : "s"
              } can use guided Greenhouse autofill today.`
            : "Move roles into Apply next to prepare an application kit."
        }</p>
        <p class="mini-note">${
          unsupportedCount > 0
            ? `${unsupportedCount} queued role${
                unsupportedCount === 1 ? "" : "s"
              } still need manual review until Lever or Ashby adapters land.`
            : "Everything in the current queue is on the supported path."
        }</p>
        ${
          adapterChips.length > 0
            ? `<div class="chip-row">
                ${adapterChips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join("")}
              </div>`
            : ""
        }
        ${
          missingBasics.length > 0
            ? `<p class="mini-note">Add ${escapeHtml(missingBasics.join(", "))} before running autofill.</p>`
            : `<p class="mini-note">Your basic autofill identity fields are in place.</p>`
        }
        ${
          missingRecommended.length > 0
            ? `<p class="mini-note">Recommended next: ${escapeHtml(
                missingRecommended.join(", ")
              )}. These help with uploads and common screening fields.</p>`
            : `<p class="mini-note">Your recommended autofill fields are filled in too.</p>`
        }
        ${
          warnings.length > 0
            ? `<p class="mini-note">Automation warning${warnings.length === 1 ? "" : "s"}: ${escapeHtml(
                warnings.join(" ")
              )}</p>`
            : ""
        }
      </article>

      <article class="detail-card">
        <h4>Greenhouse workflow</h4>
        <p class="mini-note">Export your application kit, then run the local review-first filler. It opens the form, fills common fields, uploads your resume, and pauses before submit.</p>
        <div class="automation-command">
          <code>npm run autofill:greenhouse -- /path/to/job-optimizer-application-kit.json --all</code>
        </div>
        <p class="mini-note">Use <code>--job=&lt;job-id&gt;</code> if you want to review one Greenhouse role at a time.</p>
      </article>
    </div>
  `;
}

function missingAutomationFields(profile, entries) {
  return entries
    .filter(([key]) => !String(profile[key] || "").trim())
    .map(([, label]) => label);
}

function summarizeAutomationAdapters(adapterBreakdown) {
  const counts = new Map();

  for (const { automation } of adapterBreakdown) {
    const label = automation.supported
      ? `${humanizeLabel(automation.adapter)} ready`
      : `${humanizeLabel(automation.adapter)} review`;
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return [...counts.entries()].map(([label, count]) => `${label} · ${count}`);
}

function exportQueue() {
  const applicationKit = buildApplicationKit();
  const payload = JSON.stringify(applicationKit, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "job-optimizer-application-kit.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showFlash(
    applicationKit.automation.warnings.length > 0
      ? "Application kit exported. Check the automation warnings in Snapshot before running autofill."
      : "Application kit exported from your Apply next queue."
  );
}

function automationProfileWarnings(profile) {
  const warnings = [];
  const startAvailability = String(profile.answerStartAvailability || "").trim();
  const usZipCode = String(profile.answerUsZipCode || "").trim();
  const inferredPhoneCountry = normalizePhoneCountry(profile);

  if (String(profile.fullName || "").trim().split(/\s+/).filter(Boolean).length < 2) {
    warnings.push("Full name looks incomplete.");
  }

  if (!looksLikeEmail(profile.email)) {
    warnings.push("Email does not look valid.");
  }

  if (String(profile.resumeFilePath || "").trim() && sanitizeResumeFilePath(profile.resumeFilePath) !== String(profile.resumeFilePath || "").trim()) {
    warnings.push("Resume file path had wrapped quotes; the export will strip them.");
  }

  if (!startAvailability) {
    warnings.push("Start availability is blank; some Greenhouse forms require it.");
  }

  if (profileLooksUsBased(profile) && !usZipCode) {
    warnings.push("US ZIP code is blank; US-based Greenhouse forms may ask for it.");
  }

  if (String(profile.phone || "").trim() && !inferredPhoneCountry) {
    warnings.push("Phone country could not be inferred; add it if Greenhouse leaves the country code blank.");
  }

  return warnings;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function sanitizeResumeFilePath(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
}

function deriveHearAboutDetail(hearAbout, detail) {
  const trimmedDetail = String(detail || "").trim();
  if (trimmedDetail) {
    return trimmedDetail;
  }

  if (hearAbout === "linkedin") {
    return "LinkedIn";
  }

  return "";
}

function defaultUpcomingCommitments(value) {
  const trimmed = String(value || "").trim();
  return trimmed || "N/A";
}

function profileLooksUsBased(profile) {
  const currentLocation = String(profile.currentLocation || "").toLowerCase();
  const workAuthorization = String(profile.workAuthorization || "").toLowerCase();
  const sponsorship = String(profile.sponsorship || "").toLowerCase();

  return (
    /\b(us|u\.s\.|united states|charleston|ny|ca|tx|fl|ga|sc|nc)\b/.test(currentLocation) ||
    /\bus\b|united states|uscitizen|authorized to work in the u\.s\./.test(workAuthorization) ||
    sponsorship.includes("u.s.")
  );
}

function normalizePhoneCountry(profile) {
  const explicit = String(profile.answerPhoneCountry || "").trim();
  if (explicit) {
    return explicit;
  }

  const digits = String(profile.phone || "").replace(/\D/g, "");

  if (profileLooksUsBased(profile) && digits.length >= 10) {
    return "United States +1";
  }

  return "";
}

function allJobs() {
  const jobs = [
    ...state.customJobs.map(normalizeJob),
    ...state.importedJobs.map(normalizeJob),
    ...state.jobs
  ];
  const visibleJobs = jobs.some((job) => !isSampleJob(job)) ? jobs.filter((job) => !isSampleJob(job)) : jobs;
  const locationFilteredJobs = filterJobsByExcludedLocations(visibleJobs, state.discovery.excludeLocations).jobs;
  const dedupedJobs = new Map();

  locationFilteredJobs.forEach((job) => {
    const key = crossSourceIdentity(job);
    if (!dedupedJobs.has(key)) {
      dedupedJobs.set(key, job);
    }
  });

  return [...dedupedJobs.values()];
}

function normalizeJob(job) {
  return {
    company: String(job.company || "Unknown company").trim(),
    department: String(job.department || "").trim(),
    description: String(job.description || "").trim(),
    employmentType: String(job.employmentType || "Unknown").trim(),
    externalId: String(job.externalId || ""),
    id: String(job.id || `job-${Date.now()}`),
    importedAt: String(job.importedAt || ""),
    importedFrom: String(job.importedFrom || ""),
    location: String(job.location || "Not specified").trim(),
    postedAt: String(job.postedAt || new Date().toISOString().slice(0, 10)),
    remote: Boolean(job.remote),
    salaryMax: Number(job.salaryMax || 0) || null,
    salaryMin: Number(job.salaryMin || 0) || null,
    skills: Array.isArray(job.skills)
      ? job.skills.map((skill) => String(skill).trim()).filter(Boolean)
      : [],
    source: String(job.source || "unknown"),
    sourceLabel: String(job.sourceLabel || defaultSourceLabel(job)).trim(),
    sourceUrl: String(job.sourceUrl || "").trim(),
    team: String(job.team || "").trim(),
    title: String(job.title || "Untitled role").trim(),
    url: String(job.url || "").trim()
  };
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function salaryLabel(job) {
  if (!job.salaryMin && !job.salaryMax) {
    return "Comp not listed";
  }

  if (job.salaryMin && job.salaryMax) {
    return `$${formatNumber(job.salaryMin)}-$${formatNumber(job.salaryMax)}`;
  }

  return `$${formatNumber(job.salaryMax || job.salaryMin)}`;
}

function prettyDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function fitClass(fitBucket) {
  return `pill-${fitBucket}`;
}

function fitLabel(fitBucket) {
  return (
    {
      skip: "Skip",
      stretch: "Stretch",
      strong: "Strong fit",
      worth: "Worth a look"
    }[fitBucket] || "Unknown"
  );
}

function currentStatus(jobId) {
  return state.statuses[jobId] || "saved";
}

function currentStatusLabel(jobId) {
  return STATUS_LABELS[currentStatus(jobId)] || "Saved";
}

function createMetricCard(label, value) {
  return `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </article>
  `;
}

function mergeImportedJobs(existingJobs, incomingJobs) {
  const merged = new Map();

  [...existingJobs, ...incomingJobs].forEach((job) => {
    const normalizedJob = normalizeJob(job);
    const key = importIdentity(normalizedJob);
    merged.set(key, normalizedJob);
  });

  return [...merged.values()].sort((left, right) => right.postedAt.localeCompare(left.postedAt));
}

function importIdentity(job) {
  return [job.url || "", job.externalId || "", `${job.company}::${job.title}`.toLowerCase()].join("::");
}

function crossSourceIdentity(job) {
  return job.url || job.externalId ? importIdentity(job) : String(job.id || importIdentity(job));
}

function summarizeImportedSources(jobs) {
  const counts = new Map();

  jobs.forEach((job) => {
    const label = job.sourceLabel || job.source || "Imported";
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return [...counts.entries()].map(([label, count]) => `${label}: ${count}`);
}

function renderCandidateAssetsCard(job) {
  const links = publicProfileLinks(state.profile);

  if (links.length === 0 && job.resumeSignalHits.length === 0) {
    return "";
  }

  return `
    <div class="detail-card">
      <h4>Candidate assets</h4>
      ${
        links.length > 0
          ? `<div class="link-row">
              ${links
                .map(
                  (link) => `
                    <a class="link-chip" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">
                      ${escapeHtml(link.label)}
                    </a>
                  `
                )
                .join("")}
            </div>`
          : ""
      }
      ${
        job.resumeSignalHits.length > 0
          ? `
              <p class="mini-note">Resume-backed signals for this role</p>
              <div class="chip-row">
                ${job.resumeSignalHits
                  .map((skill) => `<span class="chip">${escapeHtml(skill)}</span>`)
                  .join("")}
              </div>
            `
          : `<p class="muted">Add resume text to surface stronger evidence for each job.</p>`
      }
    </div>
  `;
}

function getResumeSignals(profile) {
  const text = String(profile.resumeText || "").toLowerCase();
  const skills = RESUME_SKILL_LIBRARY.filter((skill) => text.includes(skill));
  return {
    skills: skills.slice(0, 12)
  };
}

function publicProfileLinks(profile) {
  return [
    { label: "LinkedIn", href: normalizeUrl(profile.linkedinUrl) },
    { label: "GitHub", href: normalizeUrl(profile.githubUrl) },
    { label: "Portfolio", href: normalizeUrl(profile.portfolioUrl) }
  ].filter((link) => link.href);
}

function exportProfileSnapshot(profile) {
  return {
    answerAgencyExperience: profile.answerAgencyExperience,
    answerAgencyName: profile.answerAgencyName,
    answerEmploymentPreference: profile.answerEmploymentPreference,
    answerHearAbout: profile.answerHearAbout,
    answerHearAboutDetail: profile.answerHearAboutDetail,
    answerPhoneCountry: profile.answerPhoneCountry,
    answerPronouns: profile.answerPronouns,
    answerStartAvailability: profile.answerStartAvailability,
    answerUpcomingCommitments: profile.answerUpcomingCommitments,
    answerUsZipCode: profile.answerUsZipCode,
    currentLocation: profile.currentLocation,
    email: profile.email,
    fullName: profile.fullName,
    phone: profile.phone,
    summary: profile.summary,
    linkedinUrl: normalizeUrl(profile.linkedinUrl),
    githubUrl: normalizeUrl(profile.githubUrl),
    portfolioUrl: normalizeUrl(profile.portfolioUrl),
    resumeFilePath: profile.resumeFilePath,
    salaryFloor: profile.salaryFloor,
    sponsorship: profile.sponsorship,
    targetTitles: splitList(profile.targetTitles),
    coreSkills: splitList(profile.coreSkills),
    bonusSkills: splitList(profile.bonusSkills),
    resumeSignals: getResumeSignals(profile).skills,
    workAuthorization: profile.workAuthorization
  };
}

async function importLiveJobs(urls, options = {}) {
  const normalizedUrls = normalizeSourceUrls(urls);

  if (normalizedUrls.length === 0) {
    showFlash("Add at least one discovery source before pulling more jobs.");
    return;
  }

  if (state.importInFlight) {
    showFlash("A live import is already running.");
    return null;
  }

  if (options.rememberSources !== false) {
    rememberDiscoverySources(normalizedUrls);
  }
  state.importInFlight = true;
  syncImportControls();

  try {
    const previousBoardKeys = new Set(allJobs().map((job) => crossSourceIdentity(job)));

    showFlash(
      options.loadingMessage ||
        `Importing jobs from ${normalizedUrls.length} source${normalizedUrls.length === 1 ? "" : "s"}...`
    );

    const response = await fetch("/api/import-jobs", {
      body: JSON.stringify({ urls: normalizedUrls }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Could not import jobs from those sources.");
    }

    const discoveredJobs = Array.isArray(payload.jobs) ? payload.jobs.map(normalizeJob) : [];
    const remoteModeJobs = applyDiscoveryRemoteMode(discoveredJobs, state.discovery.remoteMode);
    const locationFilterResult = filterJobsByExcludedLocations(remoteModeJobs, state.discovery.excludeLocations);
    const incomingJobs = locationFilterResult.jobs;
    state.importedJobs = mergeImportedJobs(state.importedJobs, incomingJobs);
    const mergedBoardJobs = allJobs();
    const netNewJobs = mergedBoardJobs.filter((job) => !previousBoardKeys.has(crossSourceIdentity(job)));
    const newActiveJobs = netNewJobs.filter((job) => !isReferenceStatus(currentStatus(job.id)) && currentStatus(job.id) !== "apply-next");
    const newQueuedJobs = netNewJobs.filter((job) => currentStatus(job.id) === "apply-next");
    const newReferenceJobs = netNewJobs.filter((job) => isReferenceStatus(currentStatus(job.id)));
    state.importReport = {
      errors: Array.isArray(payload.errors) ? payload.errors : [],
      activeCount: newActiveJobs.length,
      excludedLocationCount: locationFilterResult.excludedCount,
      importedCount: netNewJobs.length,
      keptCount: incomingJobs.length,
      queuedCount: newQueuedJobs.length,
      referenceCount: newReferenceJobs.length,
      remoteCount: incomingJobs.filter((job) => job.remote).length,
      remoteMode: state.discovery.remoteMode,
      sources: Array.isArray(payload.sources) ? payload.sources : [],
      totalFound: discoveredJobs.length
    };

    writeJson(STORAGE_KEYS.importedJobs, state.importedJobs);
    if (incomingJobs[0]) {
      state.selectedJobId = incomingJobs[0].id;
    }

    if (state.importedJobs.length > 0) {
      state.autoPullAttempted = false;
    }

    const result = {
      activeCount: state.importReport.activeCount,
      importedCount: state.importReport.importedCount,
      totalFound: incomingJobs.length,
      urls: normalizedUrls
    };

    render();
    if (!options.suppressResultFlash) {
      showFlash(
        state.importReport.importedCount > 0
          ? state.importReport.activeCount > 0
            ? `Imported ${state.importReport.importedCount} new board role${
                state.importReport.importedCount === 1 ? "" : "s"
              }. ${state.importReport.activeCount} landed in Ranked Leads.`
            : `Imported ${state.importReport.importedCount} new board role${
                state.importReport.importedCount === 1 ? "" : "s"
              }, but none landed in Ranked Leads. Check Apply next or the Reference Shelf.`
          : "Import finished. No new board roles were added after dedupe."
      );
    }

    return result;
  } catch (error) {
    console.error(error);
    if (!options.suppressErrorFlash) {
      showFlash(error instanceof Error ? error.message : "Could not import jobs right now.");
    }
    return null;
  } finally {
    state.importInFlight = false;
    syncImportControls();
  }
}

function normalizeSourceUrls(value) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : String(value || "").split("\n"))
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeExcludedLocationsText(value) {
  return normalizeExcludedLocations(value).join(", ");
}

async function importNextDiscoveryBatch(options = {}) {
  const batchCount = CURATED_DISCOVERY_BATCHES.length;
  if (batchCount === 0) {
    showFlash("No discovery batches are configured yet.");
    return null;
  }

  const startIndex = normalizeBatchIndex(state.discovery.fallbackBatchIndex);

  for (let offset = 0; offset < batchCount; offset += 1) {
    const batchIndex = normalizeBatchIndex(startIndex + offset);
    const urls = CURATED_DISCOVERY_BATCHES[batchIndex];
    const result = await importLiveJobs(urls, {
      loadingMessage:
        offset === 0
          ? options.loadingMessage
          : "That batch had no new jobs. Trying another discovery batch...",
      rememberSources: false,
      suppressErrorFlash: offset < batchCount - 1,
      suppressResultFlash: true
    });

    state.discovery.fallbackBatchIndex = normalizeBatchIndex(batchIndex + 1);
    persistDiscoverySettings();

    if (!result) {
      if (offset === batchCount - 1) {
        showFlash("Could not pull more jobs right now.");
      }
      continue;
    }

    if (result.importedCount > 0) {
      showFlash(
        `Imported ${result.importedCount} new job${result.importedCount === 1 ? "" : "s"} from discovery batch ${
          batchIndex + 1
        }.`
      );
      return result;
    }
  }

  showFlash(exhaustedDiscoveryMessage());
  return {
    importedCount: 0,
    totalFound: 0,
    urls: []
  };
}

function normalizeBatchIndex(value) {
  const batchCount = CURATED_DISCOVERY_BATCHES.length || 1;
  const numericValue = Number(value || 0) || 0;
  return ((numericValue % batchCount) + batchCount) % batchCount;
}

function exhaustedDiscoveryMessage() {
  const hasLiveBoardSnapshot = state.jobs.some((job) => !isSampleJob(job));

  if (hasLiveBoardSnapshot) {
    return "No new jobs were found across the available discovery batches. Your current board likely already contains the built-in discovery pool. Run sync:jobs again later or add more source URLs.";
  }

  return "No new jobs were found across the available discovery batches.";
}

function rememberDiscoverySources(urls) {
  const normalizedUrls = normalizeSourceUrls(urls);
  if (normalizedUrls.length === 0) {
    return;
  }

  state.discovery.sourceUrls = normalizedUrls;
  elements.importUrls.value = normalizedUrls.join("\n");
  persistDiscoverySettings();
}

function persistDiscoverySettings() {
  writeJson(STORAGE_KEYS.discovery, state.discovery);
}

function syncImportControls() {
  const disabled = state.importInFlight;
  elements.autoPullToggle.disabled = disabled;
  elements.clearImportedJobs.disabled = disabled;
  elements.excludeLocationsInput.disabled = disabled;
  elements.importUrls.disabled = disabled;
  elements.loadGreenhouseJobs.disabled = disabled;
  elements.loadStarterJobs.disabled = disabled;
  elements.pullMoreJobs.disabled = disabled;
  elements.remoteModeSelect.disabled = disabled;
  elements.submitImportJobs.disabled = disabled;
}

function scheduleAutoPullCheck() {
  window.clearTimeout(scheduleAutoPullCheck.timeout);
  scheduleAutoPullCheck.timeout = window.setTimeout(() => {
    maybeAutoPullWhenEmpty();
  }, 0);
}

async function maybeAutoPullWhenEmpty() {
  if (state.importInFlight || !state.discovery.autoPullWhenEmpty) {
    return;
  }

  if (activeLeadJobs().length > 0) {
    return;
  }

  if (state.autoPullAttempted) {
    return;
  }

  state.autoPullAttempted = true;
  await importNextDiscoveryBatch({
    loadingMessage: "No active leads left. Pulling another batch of jobs..."
  });
}

function defaultSourceLabel(job) {
  return String(job.source || "").trim() === "manual-seed"
    ? "Starter sample"
    : humanizeLabel(job.source || "Unknown source");
}

function isSampleJob(job) {
  return String(job.source || "").trim() === "manual-seed" || isPlaceholderUrl(job.url);
}

function isPlaceholderUrl(value) {
  try {
    return new URL(String(value || "")).hostname === "example.com";
  } catch (error) {
    return false;
  }
}

function isReferenceStatus(status) {
  return status === "applied" || status === "archived";
}

function isPdfFile(file) {
  const name = String(file?.name || "").toLowerCase();
  return file?.type === "application/pdf" || name.endsWith(".pdf");
}

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

function writeJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function showFlash(message) {
  elements.flash.textContent = message;
  elements.flash.hidden = false;
  window.clearTimeout(showFlash.timeout);
  showFlash.timeout = window.setTimeout(() => {
    elements.flash.hidden = true;
  }, 2600);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function normalizeResumeText(value) {
  return String(value || "")
    .replaceAll("\r\n", "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^[a-z]+:\/\//i.test(raw)) {
    return raw;
  }

  return `https://${raw}`;
}

function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}

function humanizeLabel(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}
