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
        id: job.id,
        mode: reviewOnly ? "review-only" : "submit-enabled",
        submitted: false,
        title: job.title,
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
  const candidate = job.autofillDefaults || {};

  if (candidate.fullName) {
    await fillLabeledField(page, ["full name"], candidate.fullName, jobReport);
  }

  if (candidate.firstName) {
    await fillLabeledField(page, ["first name", "legal first name"], candidate.firstName, jobReport, [
      "#first_name",
      "input[name='first_name']"
    ]);
  }

  if (candidate.lastName) {
    await fillLabeledField(page, ["last name", "legal last name"], candidate.lastName, jobReport, [
      "#last_name",
      "input[name='last_name']"
    ]);
  }

  if (candidate.email) {
    await fillLabeledField(page, ["email"], candidate.email, jobReport, ["#email", "input[name='email']"]);
  }

  if (candidate.phone) {
    await fillLabeledField(page, ["phone"], candidate.phone, jobReport, ["#phone", "input[name='phone']"]);
  }

  if (candidate.currentLocation) {
    await fillLabeledField(page, ["location", "current location", "city"], candidate.currentLocation, jobReport);
  }

  if (candidate.linkedinUrl) {
    await fillLabeledField(page, ["linkedin"], candidate.linkedinUrl, jobReport);
  }

  if (candidate.githubUrl) {
    await fillLabeledField(page, ["github"], candidate.githubUrl, jobReport);
  }

  if (candidate.portfolioUrl) {
    await fillLabeledField(page, ["portfolio", "website", "personal website"], candidate.portfolioUrl, jobReport);
  }

  if (candidate.workAuthorization) {
    await fillLabeledField(
      page,
      ["work authorization", "authorized to work", "work status"],
      candidate.workAuthorization,
      jobReport
    );
  }

  if (candidate.sponsorship) {
    await fillLabeledField(page, ["sponsorship", "visa"], candidate.sponsorship, jobReport);
  }

  if (candidate.resumeFilePath) {
    await attachResume(page, candidate.resumeFilePath, jobReport);
  }
}

async function fillLabeledField(page, labels, value, jobReport, selectors = []) {
  if (!value) {
    return;
  }

  for (const label of labels) {
    try {
      const field = page.getByLabel(new RegExp(label, "i")).first();
      await field.waitFor({ state: "visible", timeout: 500 });
      await field.fill(value);
      jobReport.fieldsFilled.push(label);
      return;
    } catch (error) {
      // Try the next label or selector.
    }
  }

  for (const selector of selectors) {
    try {
      const field = page.locator(selector).first();
      await field.waitFor({ state: "visible", timeout: 500 });
      await field.fill(value);
      jobReport.fieldsFilled.push(selector);
      return;
    } catch (error) {
      // Try the next selector.
    }
  }
}

async function attachResume(page, resumeFilePath, jobReport) {
  const selectors = [
    "input[type='file']",
    "input[name='resume']",
    "input[name='attachments[resume]']"
  ];

  for (const selector of selectors) {
    try {
      const input = page.locator(selector).first();
      await input.waitFor({ state: "attached", timeout: 800 });
      await input.setInputFiles(resumeFilePath);
      jobReport.fieldsFilled.push("resume upload");
      return;
    } catch (error) {
      // Keep looking for a compatible file input.
    }
  }
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
