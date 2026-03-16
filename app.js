const STORAGE_KEYS = {
  customJobs: "job-optimizer-custom-jobs",
  importedJobs: "job-optimizer-imported-jobs",
  profile: "job-optimizer-profile",
  statuses: "job-optimizer-statuses"
};

const DEFAULT_PROFILE = {
  summary: "React Native engineer focused on polished cross-platform product work.",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  salaryFloor: 150000,
  targetTitles:
    "React Native Engineer, Senior React Native Engineer, Mobile Engineer, Expo Developer, Product Engineer",
  coreSkills:
    "React Native, TypeScript, Expo, JavaScript, iOS, Android, Mobile Release",
  bonusSkills:
    "GraphQL, Jest, Detox, Fastlane, Native Modules, CI/CD, App Store, Play Store, Performance",
  avoidKeywords:
    "onsite five days, onsite four days, no remote, swift only, kotlin only, native rewrite",
  resumeText: ""
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

const STARTER_SOURCE_URLS = [
  "https://jobs.ashbyhq.com/Nash/dc9645ae-dab2-4ed1-8db4-b06ae790f747",
  "https://jobs.ashbyhq.com/partiful/0a8ff10d-0adb-4978-830b-f2901321302c",
  "https://jobs.lever.co/filevine/1935eaab-1536-442f-9b55-0110ce6abe3a",
  "https://jobs.lever.co/USMobile/5c7bd7b9-477a-4006-b766-486eb81bead2",
  "https://jobs.lever.co/wahed.com/11dae8eb-7800-42c6-b9b0-a19690a167a1",
  "https://bitso.com/jobs/6507583003?gh_jid=6507583003"
];

const state = {
  customJobs: [],
  importedJobs: [],
  importReport: null,
  jobs: [],
  profile: { ...DEFAULT_PROFILE },
  selectedJobId: null,
  statuses: {},
  filters: {
    fit: "all",
    search: "",
    status: "all"
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
  if (!state.selectedJobId && allJobs().length > 0) {
    state.selectedJobId = allJobs()[0].id;
  }
  render();
}

function cacheElements() {
  elements.clearImportedJobs = document.querySelector("#clearImportedJobs");
  elements.exportQueue = document.querySelector("#exportQueue");
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
  elements.loadStarterJobs = document.querySelector("#loadStarterJobs");
  elements.metrics = document.querySelector("#metrics");
  elements.profileForm = document.querySelector("#profileForm");
  elements.profileSignals = document.querySelector("#profileSignals");
  elements.queueList = document.querySelector("#queueList");
  elements.resumeFile = document.querySelector("#resumeFile");
  elements.searchRecipes = document.querySelector("#searchRecipes");
}

function restoreState() {
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
  elements.clearImportedJobs.addEventListener("click", handleClearImportedJobs);
  elements.importForm.addEventListener("submit", handleImportSubmit);
  elements.loadStarterJobs.addEventListener("click", handleLoadStarterJobs);
  elements.profileForm.addEventListener("input", handleProfileChange);
  elements.filtersForm.addEventListener("input", handleFilterChange);
  elements.historyList.addEventListener("click", handleJobSelection);
  elements.jobForm.addEventListener("submit", handleJobSubmit);
  elements.jobList.addEventListener("click", handleJobSelection);
  elements.queueList.addEventListener("click", handleJobSelection);
  elements.jobDetail.addEventListener("click", handleDetailClick);
  elements.jobDetail.addEventListener("change", handleDetailChange);
  elements.searchRecipes.addEventListener("click", handleRecipeClick);
  elements.exportQueue.addEventListener("click", exportQueue);
  elements.resumeFile.addEventListener("change", handleResumeUpload);
}

function handleProfileChange() {
  const formData = new FormData(elements.profileForm);
  state.profile = {
    summary: String(formData.get("summary") || "").trim(),
    linkedinUrl: String(formData.get("linkedinUrl") || "").trim(),
    githubUrl: String(formData.get("githubUrl") || "").trim(),
    portfolioUrl: String(formData.get("portfolioUrl") || "").trim(),
    salaryFloor: Number(formData.get("salaryFloor") || 0),
    targetTitles: String(formData.get("targetTitles") || "").trim(),
    coreSkills: String(formData.get("coreSkills") || "").trim(),
    bonusSkills: String(formData.get("bonusSkills") || "").trim(),
    avoidKeywords: String(formData.get("avoidKeywords") || "").trim(),
    resumeText: String(formData.get("resumeText") || "").trim()
  };
  writeJson(STORAGE_KEYS.profile, state.profile);
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

  const formData = new FormData(elements.importForm);
  const rawValue = String(formData.get("sourceUrls") || "").trim();
  const urls = rawValue
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    showFlash("Paste at least one Greenhouse, Lever, Ashby, or direct job URL.");
    return;
  }

  await importLiveJobs(urls);
}

async function handleLoadStarterJobs() {
  elements.importUrls.value = STARTER_SOURCE_URLS.join("\n");
  await importLiveJobs(STARTER_SOURCE_URLS, {
    loadingMessage: "Loading starter live jobs..."
  });
}

function handleClearImportedJobs() {
  state.importedJobs = [];
  state.importReport = null;
  writeJson(STORAGE_KEYS.importedJobs, state.importedJobs);
  render();
  showFlash("Imported jobs cleared.");
}

function handleFilterChange() {
  const formData = new FormData(elements.filtersForm);
  state.filters = {
    fit: String(formData.get("fit") || "all"),
    search: String(formData.get("search") || "").trim().toLowerCase(),
    status: String(formData.get("status") || "all")
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
  renderProfileSignals();
  renderImportResults();
  renderSearchRecipes();
  renderSnapshot();
  renderHistoryList();
  renderJobList();
  renderJobDetail();
}

function hydrateForms() {
  elements.profileForm.summary.value = state.profile.summary;
  elements.profileForm.linkedinUrl.value = state.profile.linkedinUrl;
  elements.profileForm.githubUrl.value = state.profile.githubUrl;
  elements.profileForm.portfolioUrl.value = state.profile.portfolioUrl;
  elements.profileForm.salaryFloor.value = state.profile.salaryFloor;
  elements.profileForm.targetTitles.value = state.profile.targetTitles;
  elements.profileForm.coreSkills.value = state.profile.coreSkills;
  elements.profileForm.bonusSkills.value = state.profile.bonusSkills;
  elements.profileForm.avoidKeywords.value = state.profile.avoidKeywords;
  elements.profileForm.resumeText.value = state.profile.resumeText;

  elements.filtersForm.fit.value = state.filters.fit;
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
      </article>

      <article class="detail-card">
        <h4>Last import</h4>
        ${
          report
            ? `
                <p class="mini-note">
                  Found ${report.totalFound} matching role${report.totalFound === 1 ? "" : "s"} and added ${report.importedCount} new one${
                    report.importedCount === 1 ? "" : "s"
                  } after dedupe.
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
  const jobs = analyzedJobs().filter((job) => !isReferenceStatus(currentStatus(job.id)));
  const strongFits = jobs.filter((job) => job.fitBucket === "strong").length;
  const remoteFits = jobs.filter((job) => job.remote).length;
  const applyNext = jobs.filter((job) => currentStatus(job.id) === "apply-next").length;
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

  const applyQueue = buildApplyQueue(jobs);
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
      : `<div class="detail-card"><p class="muted">Mark interesting roles as "Apply next" to build a tighter queue.</p></div>`;

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
  const jobs = historyJobs();

  elements.historyList.innerHTML =
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
      : `<div class="detail-card"><p class="muted">Jobs marked as Applied or Archived will collect here so you can reference them without crowding the active board.</p></div>`;
}

function renderJobList() {
  const jobs = filteredJobs();
  const referenceCount = historyJobs().length;
  const preserveSelection = analyzedJobs().some(
    (job) => job.id === state.selectedJobId && isReferenceStatus(currentStatus(job.id))
  );

  if (!preserveSelection && !jobs.some((job) => job.id === state.selectedJobId) && jobs[0]) {
    state.selectedJobId = jobs[0].id;
  }

  elements.jobCount.textContent = `${jobs.length} role${jobs.length === 1 ? "" : "s"}`;
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
      : `<div class="empty-state">${
          referenceCount > 0
            ? "No active leads match these filters right now. Check the Reference Shelf for applied and archived jobs."
            : "Nothing matches these filters yet. Loosen the fit filter or add a new lead."
        }</div>`;
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
  return analyzedJobs().filter((job) => {
    const status = currentStatus(job.id);
    const haystack = `${job.title} ${job.company} ${job.description} ${job.skills.join(" ")}`.toLowerCase();
    const matchesFit = state.filters.fit === "all" || job.fitBucket === state.filters.fit;
    const matchesStatus =
      state.filters.status === "all" ? !isReferenceStatus(status) : status === state.filters.status;
    const matchesSearch = !state.filters.search || haystack.includes(state.filters.search);
    return matchesFit && matchesStatus && matchesSearch;
  });
}

function buildApplyQueue(jobs) {
  const marked = jobs.filter((job) => currentStatus(job.id) === "apply-next");
  const suggested = jobs.filter(
    (job) => currentStatus(job.id) === "saved" && (job.fitBucket === "strong" || job.fitBucket === "worth")
  );
  return [...marked, ...suggested].slice(0, 5);
}

function historyJobs() {
  const statusOrder = {
    applied: 0,
    archived: 1
  };

  return analyzedJobs()
    .filter((job) => isReferenceStatus(currentStatus(job.id)))
    .sort(
      (left, right) =>
        (statusOrder[currentStatus(left.id)] || 99) - (statusOrder[currentStatus(right.id)] || 99) ||
        right.postedAt.localeCompare(left.postedAt) ||
        right.score - left.score
    );
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

function exportQueue() {
  const jobs = buildApplyQueue(analyzedJobs()).map((job) => ({
    company: job.company,
    fit: fitLabel(job.fitBucket),
    location: job.location,
    pitch: job.pitch,
    score: job.score,
    status: currentStatusLabel(job.id),
    title: job.title,
    url: job.url || ""
  }));

  const payload = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      profile: exportProfileSnapshot(state.profile),
      jobs
    },
    null,
    2
  );
  const blob = new Blob([payload], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "job-optimizer-queue.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  showFlash("Apply queue exported.");
}

function allJobs() {
  const jobs = [
    ...state.customJobs.map(normalizeJob),
    ...state.importedJobs.map(normalizeJob),
    ...state.jobs
  ];
  return jobs.some((job) => !isSampleJob(job)) ? jobs.filter((job) => !isSampleJob(job)) : jobs;
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
    summary: profile.summary,
    linkedinUrl: normalizeUrl(profile.linkedinUrl),
    githubUrl: normalizeUrl(profile.githubUrl),
    portfolioUrl: normalizeUrl(profile.portfolioUrl),
    salaryFloor: profile.salaryFloor,
    targetTitles: splitList(profile.targetTitles),
    coreSkills: splitList(profile.coreSkills),
    bonusSkills: splitList(profile.bonusSkills),
    resumeSignals: getResumeSignals(profile).skills
  };
}

async function importLiveJobs(urls, options = {}) {
  try {
    showFlash(
      options.loadingMessage ||
        `Importing jobs from ${urls.length} source${urls.length === 1 ? "" : "s"}...`
    );

    const response = await fetch("/api/import-jobs", {
      body: JSON.stringify({ urls }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Could not import jobs from those sources.");
    }

    const incomingJobs = Array.isArray(payload.jobs) ? payload.jobs.map(normalizeJob) : [];
    const previousCount = state.importedJobs.length;
    state.importedJobs = mergeImportedJobs(state.importedJobs, incomingJobs);
    state.importReport = {
      errors: Array.isArray(payload.errors) ? payload.errors : [],
      importedCount: state.importedJobs.length - previousCount,
      sources: Array.isArray(payload.sources) ? payload.sources : [],
      totalFound: incomingJobs.length
    };

    writeJson(STORAGE_KEYS.importedJobs, state.importedJobs);
    if (incomingJobs[0]) {
      state.selectedJobId = incomingJobs[0].id;
    }

    render();
    showFlash(
      state.importReport.importedCount > 0
        ? `Imported ${state.importReport.importedCount} new job${state.importReport.importedCount === 1 ? "" : "s"}.`
        : "Import finished. No new jobs were added after dedupe."
    );
  } catch (error) {
    console.error(error);
    showFlash(error instanceof Error ? error.message : "Could not import jobs right now.");
  }
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
