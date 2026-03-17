import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const kitPathArg = args.find((arg) => !arg.startsWith("--"));
const jobId = readOptionValue(args, "--job=");
const runAll = args.includes("--all");
const headless = args.includes("--headless");
const reviewOnly = !args.includes("--submit");
const IGNORED_SUBMIT_MISSING = ["full name: no matching input found"];
const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;

if (isDirectRun && !kitPathArg) {
  console.error(
    "Usage: node scripts/autofill-greenhouse.mjs <application-kit.json> [--job=<job-id>] [--all] [--headless]"
  );
  process.exitCode = 1;
} else if (isDirectRun) {
  await runGreenhouseAutofill(path.resolve(process.cwd(), kitPathArg), {
    headless,
    jobId,
    reviewOnly,
    runAll
  });
}

export async function runGreenhouseAutofill(kitPath, options = {}) {
  const {
    headless: runHeadless = false,
    jobId: selectedJobId = "",
    reviewOnly: runInReviewOnly = true,
    runAll: shouldRunAll = false
  } = options;
  const kit = JSON.parse(await readFile(kitPath, "utf8"));
  const jobs = Array.isArray(kit.jobs) ? kit.jobs : [];
  const sharedCandidate = kit.candidate || {};
  const greenhouseJobs = jobs.filter(
    (job) => job?.automation?.adapter === "greenhouse" && job?.automation?.supported && job?.url
  );
  const selectedJobs = selectedJobId
    ? greenhouseJobs.filter((job) => job.id === selectedJobId)
    : shouldRunAll
      ? greenhouseJobs
      : greenhouseJobs.slice(0, 1);

  if (selectedJobs.length === 0) {
    console.error(
      selectedJobId
        ? `No Greenhouse job matched --job=${selectedJobId} in that application kit.`
        : "No Greenhouse jobs were found in that application kit."
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    runInReviewOnly
      ? "Greenhouse autofill is running in review-only mode. Add --submit if you want it to click Submit application."
      : "Greenhouse autofill is running in submit-enabled mode."
  );

  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: runHeadless });
  const context = await browser.newContext();
  const report = [];

  try {
    for (const job of selectedJobs) {
      const page = await context.newPage();
      const jobReport = {
        blockingIssues: [],
        company: job.company,
        confirmationUrl: "",
        fieldsFilled: [],
        fieldsMissing: [],
        id: job.id,
        mode: runInReviewOnly ? "review-only" : "submit-enabled",
        readyToSubmit: false,
        submitted: false,
        title: job.title,
        unmatchedQuestions: [],
        url: job.url
      };

      try {
        const candidate = mergeAutofillCandidate(sharedCandidate, job.autofillDefaults || {});
        await page.goto(job.url, { waitUntil: "domcontentloaded" });
        await openGreenhouseApplySection(page);
        await fillGreenhouseApplication(page, candidate, jobReport);
        jobReport.blockingIssues = await collectGreenhouseSubmitBlockers(page, jobReport);
        jobReport.readyToSubmit = jobReport.blockingIssues.length === 0;

        if (runInReviewOnly) {
          await focusSubmitButton(page);
          console.log(`Prepared ${job.title} at ${job.company}. Review the form in the open browser and submit manually if it looks good.`);
        } else if (!jobReport.readyToSubmit) {
          console.log(
            `Blocked submit for ${job.title} at ${job.company}. Remaining issues: ${jobReport.blockingIssues.join(" | ")}`
          );
        } else {
          await submitGreenhouseApplication(page, jobReport, { canPromptAfterCaptcha: !runHeadless });
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

    if (!runHeadless) {
      console.log("Browser left open for review. Press Enter here when you are ready to close it.");
      await waitForEnter();
    }

    return { kitPath, report, reportPath };
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

async function fillGreenhouseApplication(page, candidateDefaults, jobReport) {
  const candidate = normalizeCandidate(candidateDefaults || {});

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
      labels: ["country"],
      name: "phone country",
      selectors: ["#country", "input[aria-label='Country']"],
      value: candidate.phoneCountry
    },
    jobReport,
    { optional: true }
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
  await page.waitForTimeout(300);
  jobReport.unmatchedQuestions = reconcileGreenhouseQuestions(
    await collectUnmatchedGreenhouseQuestions(page),
    jobReport.fieldsFilled
  );
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
      if (selectedOption) {
        await page.waitForTimeout(200);
        await blurGreenhouseInput(page, input);
      }
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
  const candidateValues = buildGreenhouseComboboxSearchTerms(value, options.matchMode);

  for (const candidateValue of candidateValues) {
    const attempts = [
      async () => {
        await input.click();
        await input.fill(candidateValue);
      },
      async () => {
        await clearGreenhouseInput(input);
        await input.type(candidateValue, { delay: 24 });
      }
    ];

    for (const attempt of attempts) {
      try {
        await attempt();
        await page.waitForTimeout(300);

        const selectedOption = await selectGreenhouseComboboxOption(page, input, candidateValue, {
          allowFirstFallback: false,
          matchMode: options.matchMode
        });
        await blurGreenhouseInput(page, input);

        if (selectedOption && matchesExpectedValue(selectedOption, value, options.matchMode)) {
          return true;
        }

        if (await greenhouseFieldMatchesValue(input, value, options)) {
          return true;
        }
      } catch (error) {
        // Try the next combobox strategy.
      }
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
    const labels = Array.from(document.querySelectorAll("label[id$='-label'][for^='question_']"));
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

      const required =
        field.getAttribute("aria-required") === "true" ||
        field.hasAttribute("required") ||
        (label.textContent || "").includes("*");
      if (!required) {
        continue;
      }

      let answered = false;
      if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
        if ((field.getAttribute("role") || "") === "combobox") {
          const control = field.closest("[class*='select__control']");
          const container =
            field.closest("[class*='select__container']") ||
            control?.parentElement ||
            field.parentElement?.parentElement?.parentElement ||
            field.parentElement?.parentElement;
          const singleValue = (
            container?.querySelector("[class*='singleValue'], [class*='single-value']")?.textContent || ""
          )
            .replace(/\*/g, "")
            .trim();
          const liveValue = (container?.querySelector("[aria-live]")?.textContent || "").replace(/\*/g, "").trim();
          const hiddenValue = Array.from(container?.querySelectorAll("input[type='hidden']") || [])
            .map((node) => (node.value || "").trim())
            .filter(Boolean)
            .join(" ");
          const wrapperText = `${control?.textContent || ""} ${singleValue} ${liveValue} ${hiddenValue}`
            .replace(/\*/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          answered =
            Boolean(singleValue || liveValue || hiddenValue) ||
            (Boolean(wrapperText) && !/^select\.\.\.$/i.test(wrapperText));
        } else {
          answered = Boolean(field.value.trim());
        }
      }

      if (!answered) {
        unanswered.push(question);
      }
    }

    const groups = Array.from(document.querySelectorAll("fieldset[id^='question_']"));
    for (const group of groups) {
      const required = (group.textContent || "").includes("*");
      if (!required) {
        continue;
      }

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
  const button = await findSubmitButton(page);
  if (!button) {
    return;
  }

  try {
    await button.scrollIntoViewIfNeeded();
  } catch (error) {
    // Ignore missing buttons.
  }
}

async function findSubmitButton(page) {
  const selectors = [
    "button[type='submit']",
    "input[type='submit']",
    "button[data-ui='submit application']"
  ];

  for (const selector of selectors) {
    try {
      const button = page.locator(selector).first();
      await button.waitFor({ state: "visible", timeout: 800 });
      return button;
    } catch (error) {
      // Ignore missing buttons.
    }
  }

  return null;
}

async function submitGreenhouseApplication(page, jobReport, options = {}) {
  const { canPromptAfterCaptcha = false } = options;
  const button = await findSubmitButton(page);
  if (!button) {
    pushUnique(jobReport.blockingIssues, "submit button not found");
    return;
  }

  const firstAttempt = await attemptGreenhouseSubmit(page, button, jobReport);
  if (firstAttempt === "submitted" || firstAttempt === "validation" || firstAttempt === "unknown") {
    return;
  }

  if (firstAttempt === "captcha" && canPromptAfterCaptcha) {
    console.log(`Solve the CAPTCHA for ${jobReport.title} at ${jobReport.company}, then press Enter here to retry submit.`);
    await focusSubmitButton(page);
    await waitForEnter();
    const retryButton = await findSubmitButton(page);
    if (!retryButton) {
      pushUnique(jobReport.blockingIssues, "submit button not found after CAPTCHA");
      return;
    }
    await attemptGreenhouseSubmit(page, retryButton, jobReport);
  }
}

async function attemptGreenhouseSubmit(page, button, jobReport) {
  await button.scrollIntoViewIfNeeded();
  await button.click();

  try {
    await Promise.race([
      page.waitForURL((url) => url.toString() !== jobReport.url, { timeout: 10000 }),
      page.getByText(/thank you for applying|application submitted|we have received your application/i).first().waitFor({
        state: "visible",
        timeout: 10000
      })
    ]);
    jobReport.submitted = true;
    jobReport.confirmationUrl = page.url();
    console.log(`Submitted ${jobReport.title} at ${jobReport.company}.`);
    return "submitted";
  } catch (error) {
    const validationErrors = await collectGreenhouseValidationErrors(page);
    if (validationErrors.length > 0) {
      for (const validationError of validationErrors) {
        pushUnique(jobReport.blockingIssues, `submit validation: ${validationError}`);
      }
      console.log(`Submit needs review for ${jobReport.title} at ${jobReport.company}.`);
      return "validation";
    }

    if (await hasVisibleCaptcha(page)) {
      pushUnique(jobReport.blockingIssues, "captcha detected");
      console.log(`Submit is waiting on CAPTCHA for ${jobReport.title} at ${jobReport.company}.`);
      return "captcha";
    }

    pushUnique(jobReport.blockingIssues, "submit confirmation was not detected");
    return "unknown";
  }
}

async function collectGreenhouseSubmitBlockers(page, jobReport) {
  const blockers = [];

  for (const missingField of jobReport.fieldsMissing) {
    if (!IGNORED_SUBMIT_MISSING.includes(missingField)) {
      blockers.push(missingField);
    }
  }

  for (const question of jobReport.unmatchedQuestions) {
    blockers.push(`question: ${question}`);
  }

  return Array.from(new Set(blockers));
}

async function hasVisibleCaptcha(page) {
  const selectors = [
    "iframe[src*='recaptcha']",
    ".g-recaptcha",
    "#recaptcha",
    "[title*='reCAPTCHA']"
  ];

  for (const selector of selectors) {
    const matches = page.locator(selector);
    const count = await matches.count();
    for (let index = 0; index < count; index += 1) {
      const match = matches.nth(index);
      try {
        if (!(await match.isVisible())) {
          continue;
        }

        const box = await match.boundingBox();
        if (!box || box.width < 40 || box.height < 20) {
          continue;
        }

        const isBadge = await match.evaluate((node) => {
          const text = `${node.getAttribute("class") || ""} ${node.getAttribute("title") || ""} ${node.id || ""}`.toLowerCase();
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
          const fixedBottomCorner =
            style.position === "fixed" &&
            rect.right >= viewportWidth - 48 &&
            rect.bottom >= viewportHeight - 48 &&
            rect.height <= 120;

          return text.includes("badge") || fixedBottomCorner;
        }).catch(() => false);

        if (isBadge) {
          continue;
        }

        return true;
      } catch (error) {
        // Ignore detached or non-visible captcha artifacts.
      }
    }
  }

  return false;
}

async function collectGreenhouseValidationErrors(page) {
  const errorTexts = [];
  const selectors = [
    "[role='alert']",
    ".error",
    ".field-error",
    ".input-error",
    ".validation-error"
  ];

  for (const selector of selectors) {
    const matches = page.locator(selector);
    const count = await matches.count();
    for (let index = 0; index < count; index += 1) {
      const text = String((await matches.nth(index).textContent()) || "").replace(/\s+/g, " ").trim();
      if (text) {
        errorTexts.push(text);
      }
    }
  }

  return Array.from(new Set(errorTexts));
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
    phoneCountry: cleanValue(candidate.phoneCountry) || inferPhoneCountry(candidate),
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

function reconcileGreenhouseQuestions(unmatchedQuestions = [], fieldsFilled = []) {
  return unmatchedQuestions.filter((question) => {
    const matchedField = greenhouseQuestionFieldName(question);
    return !matchedField || !fieldsFilled.includes(matchedField);
  });
}

function greenhouseQuestionFieldName(question) {
  const normalizedQuestion = cleanValue(question).toLowerCase();

  if (!normalizedQuestion) {
    return "";
  }

  if (normalizedQuestion.includes("how did you hear about")) {
    return "how you heard";
  }

  if (normalizedQuestion.includes("consulting firm or agency environment")) {
    return "agency experience";
  }

  if (normalizedQuestion.includes("how much lead time will you need before you can start")) {
    return "start availability";
  }

  if (normalizedQuestion.includes("what are your pronouns")) {
    return "pronouns";
  }

  if (normalizedQuestion.includes("upcoming commitments") || normalizedQuestion.includes("work schedule or availability")) {
    return "upcoming commitments";
  }

  if (normalizedQuestion.includes("zip code")) {
    return "zip code";
  }

  return "";
}

function mergeAutofillCandidate(sharedCandidate = {}, jobDefaults = {}) {
  return {
    ...sharedCandidate,
    ...jobDefaults,
    applicationAnswers: {
      ...(sharedCandidate.applicationAnswers || {}),
      ...(jobDefaults.applicationAnswers || {})
    }
  };
}

function normalizeApplicationAnswers(answers = {}) {
  const hearAbout = cleanValue(answers.hearAbout);

  return {
    agencyExperience: cleanValue(answers.agencyExperience),
    agencyName: cleanValue(answers.agencyName),
    employmentPreference: cleanValue(answers.employmentPreference),
    hearAbout,
    hearAboutDetail: cleanValue(answers.hearAboutDetail) || defaultHearAboutDetail(hearAbout),
    pronouns: cleanValue(answers.pronouns),
    startAvailability: cleanValue(answers.startAvailability),
    upcomingCommitments: cleanValue(answers.upcomingCommitments) || "N/A",
    usZipCode: cleanValue(answers.usZipCode)
  };
}

function hearAboutOptions(value) {
  const normalized = value.toLowerCase();

  if (normalized === "job-board") {
    return ["Job board (Please share which one)", "Job Board", "Job board"];
  }

  if (normalized === "linkedin") {
    return ["Job board (Please share which one)", "Job board", "Other"];
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

function defaultHearAboutDetail(value) {
  if (value === "linkedin") {
    return "LinkedIn";
  }

  return "";
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

function buildGreenhouseComboboxSearchTerms(value, matchMode = "text") {
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) {
    return [];
  }

  if (matchMode !== "location") {
    return [trimmedValue];
  }

  const parts = trimmedValue
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const cityOnly = parts[0] || trimmedValue;
  const withoutStateAbbreviation = trimmedValue.replace(/,\s*[A-Z]{2}\b/g, "").trim();

  return Array.from(new Set([trimmedValue, withoutStateAbbreviation, cityOnly].filter(Boolean)));
}

function inferPhoneCountry(candidate) {
  const currentLocation = cleanValue(candidate.currentLocation).toLowerCase();
  const workAuthorization = cleanValue(candidate.workAuthorization).toLowerCase();
  const sponsorship = cleanValue(candidate.sponsorship).toLowerCase();
  const digits = cleanValue(candidate.phone).replace(/\D/g, "");

  const looksUsBased =
    /\b(us|u\.s\.|united states|charleston|ny|ca|tx|fl|ga|sc|nc)\b/.test(currentLocation) ||
    /\bus\b|united states|uscitizen|authorized to work in the u\.s\./.test(workAuthorization) ||
    sponsorship.includes("u.s.");

  if (looksUsBased && digits.length >= 10) {
    return "United States +1";
  }

  return "";
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
