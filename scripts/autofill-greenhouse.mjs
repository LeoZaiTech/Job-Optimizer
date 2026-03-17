import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const kitPathArg = args.find((arg) => !arg.startsWith("--"));
const jobId = readOptionValue(args, "--job=");
const runAll = args.includes("--all");
const headless = args.includes("--headless");
const reviewOnly = !args.includes("--submit");

if (!kitPathArg) {
  console.error(
    "Usage: node scripts/autofill-greenhouse.mjs <application-kit.json> [--job=<job-id>] [--all] [--headless]"
  );
  process.exitCode = 1;
} else {
  await main(path.resolve(process.cwd(), kitPathArg));
}

async function main(kitPath) {
  const kit = JSON.parse(await readFile(kitPath, "utf8"));
  const jobs = Array.isArray(kit.jobs) ? kit.jobs : [];
  const greenhouseJobs = jobs.filter(
    (job) => job?.automation?.adapter === "greenhouse" && job?.automation?.supported && job?.url
  );
  const selectedJobs = jobId
    ? greenhouseJobs.filter((job) => job.id === jobId)
    : runAll
      ? greenhouseJobs
      : greenhouseJobs.slice(0, 1);

  if (selectedJobs.length === 0) {
    console.error(
      jobId
        ? `No Greenhouse job matched --job=${jobId} in that application kit.`
        : "No Greenhouse jobs were found in that application kit."
    );
    process.exitCode = 1;
    return;
  }

  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless });
  const context = await browser.newContext();
  const report = [];

  try {
    for (const job of selectedJobs) {
      const page = await context.newPage();
      const jobReport = {
        company: job.company,
        fieldsFilled: [],
        fieldsMissing: [],
        id: job.id,
        mode: reviewOnly ? "review-only" : "submit-enabled",
        submitted: false,
        title: job.title,
        unmatchedQuestions: [],
        url: job.url
      };

      try {
        await page.goto(job.url, { waitUntil: "domcontentloaded" });
        await openGreenhouseApplySection(page);
        await fillGreenhouseApplication(page, job, jobReport);

        if (reviewOnly) {
          await focusSubmitButton(page);
          console.log(`Prepared ${job.title} at ${job.company}. Review the form in the open browser and submit manually if it looks good.`);
        } else {
          console.log(`Submit mode is not enabled in this starter workflow yet. Review ${job.title} manually.`);
        }
      } catch (error) {
        jobReport.error = error instanceof Error ? error.message : "Greenhouse autofill failed.";
        console.error(`${job.title}: ${jobReport.error}`);
      }

      report.push(jobReport);
    }

    const reportPath = buildReportPath(kitPath);
    await writeFile(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), jobs: report }, null, 2));
    console.log(`Wrote Greenhouse autofill report to ${reportPath}`);

    if (!headless) {
      console.log("Browser left open for review. Press Enter here when you are ready to close it.");
      await waitForEnter();
    }
  } finally {
    await browser.close();
  }
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Playwright could not be loaded.";
    throw new Error(
      `${message} Install it with \`npm install playwright\` and then \`npx playwright install chromium\`.`
    );
  }
}

async function openGreenhouseApplySection(page) {
  const applyActions = [
    page.getByRole("link", { name: /apply/i }).first(),
    page.getByRole("button", { name: /apply/i }).first()
  ];

  for (const action of applyActions) {
    try {
      if (await action.isVisible({ timeout: 800 })) {
        await action.click();
        break;
      }
    } catch (error) {
      // Ignore missing apply actions and continue.
    }
  }
}

async function fillGreenhouseApplication(page, job, jobReport) {
  const candidate = normalizeCandidate(job.autofillDefaults || {});

  await fillGreenhouseField(
    page,
    {
      labels: ["full name"],
      name: "full name",
      selectors: ["#full_name", "input[autocomplete='name']", "input[aria-label='Full Name']"],
      value: candidate.fullName
    },
    jobReport
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["first name", "legal first name"],
      name: "first name",
      selectors: ["#first_name", "input[autocomplete='given-name']", "input[aria-label='First Name']"],
      value: candidate.firstName
    },
    jobReport
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["preferred first name", "preferred name"],
      name: "preferred first name",
      selectors: ["#preferred_name", "input[aria-label='Preferred First Name']"],
      value: candidate.firstName
    },
    jobReport,
    { optional: true }
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["last name", "legal last name"],
      name: "last name",
      selectors: ["#last_name", "input[autocomplete='family-name']", "input[aria-label='Last Name']"],
      value: candidate.lastName
    },
    jobReport
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["email"],
      name: "email",
      selectors: ["#email", "input[autocomplete='email']", "input[type='email']", "input[aria-label='Email']"],
      value: candidate.email
    },
    jobReport
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["phone"],
      name: "phone",
      selectors: ["#phone", "input[autocomplete='tel']", "input[type='tel']", "input[aria-label='Phone']"],
      value: candidate.phone
    },
    jobReport,
    { matchMode: "digits", optional: true }
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["location (city)", "location", "current location", "city"],
      name: "location",
      selectors: ["#candidate-location", "input[aria-label='Location (City)']", "input[id='candidate-location']"],
      value: candidate.currentLocation
    },
    jobReport,
    { matchMode: "location" }
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["linkedin", "linkedin profile"],
      name: "linkedin",
      selectors: ["input[aria-label='LinkedIn Profile']", "input[aria-label='LinkedIn']"],
      value: candidate.linkedinUrl
    },
    jobReport,
    { optional: true }
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["github"],
      name: "github",
      selectors: ["input[aria-label='GitHub']", "input[aria-label*='GitHub']"],
      value: candidate.githubUrl
    },
    jobReport,
    { optional: true }
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["portfolio", "website", "personal website"],
      name: "website",
      selectors: ["input[aria-label='Website']", "input[aria-label='Portfolio']", "input[aria-label='Personal Website']"],
      value: candidate.portfolioUrl || candidate.githubUrl
    },
    jobReport,
    { optional: true }
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["work authorization", "authorized to work", "work status"],
      name: "work authorization",
      selectors: [],
      value: candidate.workAuthorization
    },
    jobReport,
    { optional: true }
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["sponsorship", "visa"],
      name: "sponsorship",
      selectors: [],
      value: candidate.sponsorship
    },
    jobReport,
    { optional: true }
  );

  if (candidate.resumeFilePath) {
    await attachResume(page, candidate.resumeFilePath, jobReport);
  }

  await fillGreenhouseSavedAnswers(page, candidate.applicationAnswers, jobReport);
  jobReport.unmatchedQuestions = await collectUnmatchedGreenhouseQuestions(page);
}

async function fillGreenhouseField(page, field, jobReport, options = {}) {
  const { labels = [], name = "field", selectors = [], value } = field;

  if (!value) {
    if (!options.optional) {
      pushUnique(jobReport.fieldsMissing, `${name}: no value supplied`);
    }
    return;
  }

  const input = await findGreenhouseFieldInput(page, selectors, labels);
  if (!input) {
    if (!options.optional) {
      pushUnique(jobReport.fieldsMissing, `${name}: no matching input found`);
    }
    return;
  }

  const filled = await commitGreenhouseFieldValue(page, input, value, options);
  if (filled) {
    pushUnique(jobReport.fieldsFilled, name);
    return;
  }

  if (!options.optional) {
    pushUnique(jobReport.fieldsMissing, `${name}: value did not stick`);
  }
}

async function attachResume(page, resumeFilePath, jobReport) {
  const selectors = [
    "#resume",
    "input[type='file']",
    "input[name='resume']",
    "input[name='attachments[resume]']"
  ];

  for (const selector of selectors) {
    try {
      const input = page.locator(selector).first();
      await input.waitFor({ state: "attached", timeout: 800 });
      await input.setInputFiles(resumeFilePath);
      pushUnique(jobReport.fieldsFilled, "resume upload");
      return;
    } catch (error) {
      // Keep looking for a compatible file input.
    }
  }

  pushUnique(jobReport.fieldsMissing, "resume upload: no compatible file input found");
}

async function fillGreenhouseSavedAnswers(page, answers, jobReport) {
  const normalizedAnswers = normalizeApplicationAnswers(answers);

  await fillGreenhouseField(
    page,
    {
      labels: ["what are your pronouns"],
      name: "pronouns",
      selectors: [],
      value: normalizedAnswers.pronouns
    },
    jobReport,
    { optional: true }
  );

  await fillGreenhouseComboboxQuestion(
    page,
    /how did you hear about/i,
    hearAboutOptions(normalizedAnswers.hearAbout),
    "how you heard",
    jobReport
  );

  await fillGreenhouseField(
    page,
    {
      labels: [
        "please share more information about how you heard about this role",
        "share more information about how you heard about this role"
      ],
      name: "how you heard detail",
      selectors: [],
      value: normalizedAnswers.hearAboutDetail
    },
    jobReport,
    { optional: true }
  );

  await fillGreenhouseCheckboxQuestion(
    page,
    /employment preference/i,
    employmentPreferenceOptions(normalizedAnswers.employmentPreference),
    "employment preference",
    jobReport
  );

  await fillGreenhouseComboboxQuestion(
    page,
    /consulting firm or agency environment/i,
    yesNoOptions(normalizedAnswers.agencyExperience),
    "agency experience",
    jobReport
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["name the consulting firm or agency"],
      name: "agency name",
      selectors: [],
      value: normalizedAnswers.agencyName
    },
    jobReport,
    { optional: true }
  );

  await fillGreenhouseComboboxQuestion(
    page,
    /how much lead time will you need before you can start/i,
    normalizedAnswers.startAvailability ? [normalizedAnswers.startAvailability] : [],
    "start availability",
    jobReport
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["upcoming commitments", "could affect your work schedule or availability"],
      name: "upcoming commitments",
      selectors: [],
      value: normalizedAnswers.upcomingCommitments
    },
    jobReport,
    { optional: true }
  );

  await fillGreenhouseField(
    page,
    {
      labels: ["current zip code", "ZIP code"],
      name: "zip code",
      selectors: [],
      value: normalizedAnswers.usZipCode
    },
    jobReport,
    { optional: true }
  );
}

async function fillGreenhouseComboboxQuestion(page, labelPattern, answerOptions, fieldName, jobReport) {
  const options = answerOptions.filter(Boolean);
  if (options.length === 0) {
    return;
  }

  const input = await findGreenhouseQuestionInput(page, labelPattern);
  if (!input) {
    return;
  }

  for (const option of options) {
    try {
      await input.click();
      await clearGreenhouseInput(input);
      await input.type(option, { delay: 24 });
      await page.waitForTimeout(250);

      const selectedOption = await selectGreenhouseComboboxOption(page, input, option, { allowFirstFallback: false });
      if (selectedOption || (await greenhouseFieldMatchesValue(input, option))) {
        pushUnique(jobReport.fieldsFilled, fieldName);
        return;
      }
    } catch (error) {
      // Try the next option variant.
    }
  }

  pushUnique(jobReport.fieldsMissing, `${fieldName}: no matching option committed`);
}

async function fillGreenhouseCheckboxQuestion(page, groupPattern, answerOptions, fieldName, jobReport) {
  const options = answerOptions.filter(Boolean);
  if (options.length === 0) {
    return;
  }

  const fieldset = page.locator("fieldset").filter({ hasText: groupPattern }).first();
  if (!(await fieldset.count())) {
    return;
  }

  for (const option of options) {
    const label = fieldset.locator("label").filter({ hasText: new RegExp(escapeRegex(option), "i") }).first();
    if (await label.count()) {
      await label.click();
      pushUnique(jobReport.fieldsFilled, fieldName);
      return;
    }
  }

  pushUnique(jobReport.fieldsMissing, `${fieldName}: no matching checkbox option found`);
}

async function findGreenhouseFieldInput(page, selectors, labels) {
  for (const selector of selectors) {
    try {
      const input = page.locator(selector).first();
      await input.waitFor({ state: "visible", timeout: 800 });
      return input;
    } catch (error) {
      // Try the next selector.
    }
  }

  for (const label of labels) {
    try {
      const input = page.getByLabel(new RegExp(label, "i")).first();
      await input.waitFor({ state: "visible", timeout: 800 });
      return input;
    } catch (error) {
      // Try the next label.
    }
  }

  return null;
}

async function commitGreenhouseFieldValue(page, input, value, options = {}) {
  const role = (await input.getAttribute("role")) || "";
  if (role.toLowerCase() === "combobox") {
    return commitGreenhouseComboboxValue(page, input, value, options);
  }

  return commitGreenhouseTextValue(page, input, value, options);
}

async function commitGreenhouseTextValue(page, input, value, options = {}) {
  const attempts = [
    async () => {
      await input.click();
      await input.fill(value);
    },
    async () => {
      await clearGreenhouseInput(input);
      await input.type(value, { delay: 24 });
    }
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
      await blurGreenhouseInput(page, input);
      if (await greenhouseFieldMatchesValue(input, value, options)) {
        return true;
      }
    } catch (error) {
      // Try the next text-entry strategy.
    }
  }

  return false;
}

async function commitGreenhouseComboboxValue(page, input, value, options = {}) {
  const attempts = [
    async () => {
      await input.click();
      await input.fill(value);
    },
    async () => {
      await clearGreenhouseInput(input);
      await input.type(value, { delay: 24 });
    }
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
      await page.waitForTimeout(300);

      const selectedOption = await selectGreenhouseComboboxOption(page, input, value, {
        allowFirstFallback: false,
        matchMode: options.matchMode
      });
      if (!selectedOption) {
        await blurGreenhouseInput(page, input);
      }

      if (await greenhouseFieldMatchesValue(input, value, options)) {
        return true;
      }
    } catch (error) {
      // Try the next combobox strategy.
    }
  }

  return false;
}

async function selectGreenhouseComboboxOption(page, input, value, options = {}) {
  const { allowFirstFallback = false, matchMode = "text" } = options;
  const listboxId = await input.getAttribute("aria-controls");
  if (!listboxId) {
    return false;
  }

  const listbox = page.locator(`#${listboxId}`).first();
  if (!(await listbox.count())) {
    return false;
  }

  await page.waitForTimeout(400);
  const listOptions = listbox.locator("[role='option']");
  const optionCount = await listOptions.count();
  if (optionCount === 0) {
    return false;
  }

  for (let index = 0; index < optionCount; index += 1) {
    const option = listOptions.nth(index);
    const optionText = String((await option.textContent()) || "").trim();
    if (matchesExpectedValue(optionText, value, matchMode)) {
      await option.click();
      return optionText;
    }
  }

  if (allowFirstFallback) {
    const firstOption = listOptions.first();
    const firstText = String((await firstOption.textContent()) || "").trim();
    await firstOption.click();
    return firstText;
  }

  return false;
}

async function blurGreenhouseInput(page, input) {
  try {
    await input.press("Tab");
  } catch (error) {
    await page.keyboard.press("Tab");
  }

  await page.waitForTimeout(250);
}

async function clearGreenhouseInput(input) {
  await input.click();
  await input.press("Meta+A").catch(() => {});
  await input.press("Control+A").catch(() => {});
  await input.fill("");
}

async function greenhouseFieldMatchesValue(input, expectedValue, options = {}) {
  const fieldState = await input.evaluate((node) => {
    const control =
      node.closest("[class*='select__control']") ||
      node.parentElement?.parentElement?.parentElement ||
      node.parentElement?.parentElement ||
      node.parentElement;

    return {
      controlText: (control?.textContent || "").replace(/\*/g, " ").trim(),
      role: node.getAttribute("role") || "",
      value: "value" in node ? String(node.value || "").trim() : ""
    };
  });

  const combined = `${fieldState.value} ${fieldState.controlText}`.trim();
  return matchesExpectedValue(combined, expectedValue, options.matchMode);
}

async function findGreenhouseQuestionInput(page, labelPattern) {
  const label = page.locator("label").filter({ hasText: labelPattern }).first();
  if (!(await label.count())) {
    return null;
  }

  const forId = await label.getAttribute("for");
  if (!forId) {
    return null;
  }

  const input = page.locator(`#${forId}`).first();
  if (!(await input.count())) {
    return null;
  }

  return input;
}

async function collectUnmatchedGreenhouseQuestions(page) {
  return page.evaluate(() => {
    const unanswered = [];
    const questionsRoot = document.querySelector(".application--questions");
    if (!questionsRoot) {
      return unanswered;
    }

    const labels = Array.from(questionsRoot.querySelectorAll("label[id$='-label'][for^='question_']"));
    for (const label of labels) {
      const question = (label.textContent || "").replace(/\*/g, "").trim();
      const forId = label.getAttribute("for");
      if (!question || !forId) {
        continue;
      }

      const field = document.getElementById(forId);
      if (!field) {
        continue;
      }

      let answered = false;
      if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
        if ((field.getAttribute("role") || "") === "combobox") {
          const wrapperText = `${field.parentElement?.parentElement?.textContent || ""} ${
            field.parentElement?.textContent || ""
          }`
            .replace(/\*/g, "")
            .trim();
          answered = !/select\.\.\./i.test(wrapperText) && wrapperText.length > question.length;
        } else {
          answered = Boolean(field.value.trim());
        }
      }

      if (!answered) {
        unanswered.push(question);
      }
    }

    const groups = Array.from(questionsRoot.querySelectorAll("fieldset[id^='question_']"));
    for (const group of groups) {
      const text = (group.textContent || "").replace(/\*/g, "").trim();
      const question = text.split(/\s{2,}|\n/)[0]?.trim();
      const answered = Boolean(group.querySelector("input:checked"));
      if (question && !answered) {
        unanswered.push(question);
      }
    }

    return Array.from(new Set(unanswered));
  });
}

async function focusSubmitButton(page) {
  const selectors = [
    "button[type='submit']",
    "input[type='submit']",
    "button[data-ui='submit application']"
  ];

  for (const selector of selectors) {
    try {
      const button = page.locator(selector).first();
      await button.waitFor({ state: "visible", timeout: 800 });
      await button.scrollIntoViewIfNeeded();
      return;
    } catch (error) {
      // Ignore missing buttons.
    }
  }
}

function buildReportPath(kitPath) {
  const directory = path.dirname(kitPath);
  const extension = path.extname(kitPath);
  const baseName = path.basename(kitPath, extension || ".json");
  return path.join(directory, `${baseName}-greenhouse-report.json`);
}

function readOptionValue(argv, prefix) {
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function normalizeCandidate(candidate) {
  return {
    ...candidate,
    applicationAnswers: normalizeApplicationAnswers(candidate.applicationAnswers),
    currentLocation: cleanValue(candidate.currentLocation),
    email: cleanValue(candidate.email),
    firstName: cleanValue(candidate.firstName),
    fullName: cleanValue(candidate.fullName),
    githubUrl: cleanValue(candidate.githubUrl),
    lastName: cleanValue(candidate.lastName),
    linkedinUrl: cleanValue(candidate.linkedinUrl),
    phone: cleanValue(candidate.phone),
    portfolioUrl: cleanValue(candidate.portfolioUrl),
    resumeFilePath: cleanPath(candidate.resumeFilePath),
    sponsorship: cleanValue(candidate.sponsorship),
    workAuthorization: cleanValue(candidate.workAuthorization)
  };
}

function cleanValue(value) {
  return String(value || "").trim();
}

function cleanPath(value) {
  return cleanValue(value).replace(/^['"]+|['"]+$/g, "");
}

function normalizeApplicationAnswers(answers = {}) {
  return {
    agencyExperience: cleanValue(answers.agencyExperience),
    agencyName: cleanValue(answers.agencyName),
    employmentPreference: cleanValue(answers.employmentPreference),
    hearAbout: cleanValue(answers.hearAbout),
    hearAboutDetail: cleanValue(answers.hearAboutDetail),
    pronouns: cleanValue(answers.pronouns),
    startAvailability: cleanValue(answers.startAvailability),
    upcomingCommitments: cleanValue(answers.upcomingCommitments),
    usZipCode: cleanValue(answers.usZipCode)
  };
}

function hearAboutOptions(value) {
  const normalized = value.toLowerCase();

  if (normalized === "job-board") {
    return ["Job board (Please share which one)", "Job Board", "Job board"];
  }

  if (normalized === "linkedin") {
    return ["LinkedIn"];
  }

  if (normalized === "referral") {
    return ["Employee Referral", "Referral"];
  }

  if (normalized === "company-website") {
    return ["Company Website", "Company website", "Directly from company website"];
  }

  if (normalized === "other") {
    return ["Other"];
  }

  return [];
}

function employmentPreferenceOptions(value) {
  const normalized = value.toLowerCase();

  if (normalized === "full-time") {
    return ["Permanent/Full-time", "Full-time", "Permanent"];
  }

  if (normalized === "contract") {
    return ["Freelance/Contracting", "Contract", "Freelance"];
  }

  if (normalized === "either") {
    return ["Open to Either", "Either"];
  }

  return [];
}

function yesNoOptions(value) {
  const normalized = value.toLowerCase();
  if (normalized === "yes") {
    return ["Yes"];
  }

  if (normalized === "no") {
    return ["No"];
  }

  return [];
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesExpectedValue(actualValue, expectedValue, matchMode = "text") {
  const actual = String(actualValue || "").trim();
  const expected = String(expectedValue || "").trim();

  if (!actual || !expected) {
    return false;
  }

  if (matchMode === "digits") {
    return actual.replace(/\D/g, "").includes(expected.replace(/\D/g, ""));
  }

  const normalizedActual = normalizeMatchValue(actual);

  if (matchMode === "location") {
    return locationHints(expected).some((hint) => normalizedActual.includes(hint));
  }

  return normalizedActual.includes(normalizeMatchValue(expected));
}

function normalizeMatchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function locationHints(value) {
  const parts = String(value || "")
    .split(",")
    .map((part) => normalizeMatchValue(part))
    .filter(Boolean);
  const primary = parts[0];
  return Array.from(new Set([primary, ...parts].filter((part) => part && part.length >= 3)));
}

function pushUnique(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}

function waitForEnter() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });
}
