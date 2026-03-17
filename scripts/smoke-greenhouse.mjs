#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runGreenhouseAutofill } from "./autofill-greenhouse.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_SUMMARY_PATH = path.join(PROJECT_ROOT, "data", "greenhouse-smoke-report.json");
const DEFAULT_IGNORED_MISSING = ["full name: no matching input found"];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const argv = process.argv.slice(2);
  const explicitKitPath = argv.find((arg) => !arg.startsWith("--")) || "";
  const strict = argv.includes("--strict");
  const all = argv.includes("--all");
  const jobId = readOptionValue(argv, "--job=");
  const summaryPath = readOptionValue(argv, "--summary=") || DEFAULT_SUMMARY_PATH;
  const extraIgnoredMissing = readListOption(argv, "--allow-missing=");
  const ignoredMissing = Array.from(new Set([...DEFAULT_IGNORED_MISSING, ...extraIgnoredMissing]));
  const kitPath = explicitKitPath || (await findLatestApplicationKit());

  if (!kitPath) {
    throw new Error("No application kit was provided and no recent kit could be found in the workspace or Downloads.");
  }

  const result = await runGreenhouseAutofill(kitPath, {
    headless: true,
    jobId,
    reviewOnly: true,
    runAll: all
  });
  const reportPath = result?.reportPath || buildReportPath(kitPath);
  const rawReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
  const summary = buildSummary(rawReport, { ignoredMissing, kitPath, strict });

  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  printSummary(summary, summaryPath);

  if (strict && summary.totals.jobsWithRemainingIssues > 0) {
    process.exit(1);
  }
}

async function findLatestApplicationKit() {
  const candidates = [];
  const searchRoots = [
    path.join(PROJECT_ROOT, "data"),
    path.join(os.homedir(), "Downloads"),
    os.tmpdir()
  ];

  for (const directory of searchRoots) {
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }

        if (!/^job-optimizer-application-kit.*\.json$/i.test(entry.name) || /greenhouse-report/i.test(entry.name)) {
          continue;
        }

        const fullPath = path.join(directory, entry.name);
        const stats = await fs.stat(fullPath);
        candidates.push({ path: fullPath, mtimeMs: stats.mtimeMs });
      }
    } catch (error) {
      // Skip missing or inaccessible directories.
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.path || "";
}

function buildReportPath(kitPath) {
  const directory = path.dirname(kitPath);
  const extension = path.extname(kitPath);
  const baseName = path.basename(kitPath, extension || ".json");
  return path.join(directory, `${baseName}-greenhouse-report.json`);
}

function buildSummary(report, options) {
  const jobs = Array.isArray(report.jobs) ? report.jobs : [];

  const normalizedJobs = jobs.map((job) => {
    const blockingIssues = Array.isArray(job.blockingIssues) ? job.blockingIssues : [];
    const fieldsMissing = Array.isArray(job.fieldsMissing) ? job.fieldsMissing : [];
    const unmatchedQuestions = Array.isArray(job.unmatchedQuestions) ? job.unmatchedQuestions : [];
    const ignored = fieldsMissing.filter((item) => options.ignoredMissing.includes(item));
    const remainingMissing = fieldsMissing.filter((item) => !options.ignoredMissing.includes(item));
    const remainingIssues = blockingIssues.length > 0 ? blockingIssues : [...remainingMissing, ...unmatchedQuestions];

    return {
      blockingIssues,
      company: job.company || "",
      fieldsFilled: Array.isArray(job.fieldsFilled) ? job.fieldsFilled : [],
      id: job.id || "",
      ignoredMissing: ignored,
      mode: job.mode || "",
      remainingMissing,
      status: remainingIssues.length === 0 ? "ok" : "needs-review",
      submitted: Boolean(job.submitted),
      title: job.title || "",
      unmatchedQuestions,
      url: job.url || ""
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    ignoredMissing: options.ignoredMissing,
    sourceKit: options.kitPath,
    sourceReportGeneratedAt: report.generatedAt || "",
    strict: options.strict,
    totals: {
      jobs: normalizedJobs.length,
      jobsOk: normalizedJobs.filter((job) => job.status === "ok").length,
      jobsWithRemainingIssues: normalizedJobs.filter((job) => job.status !== "ok").length
    },
    jobs: normalizedJobs
  };
}

function printSummary(summary, summaryPath) {
  console.log(`Used kit: ${summary.sourceKit}`);
  console.log(
    `Greenhouse smoke summary: ${summary.totals.jobsOk}/${summary.totals.jobs} job(s) clean, ${summary.totals.jobsWithRemainingIssues} needing review.`
  );

  for (const job of summary.jobs) {
    const filledCount = job.fieldsFilled.length;
    const remainingIssues = job.blockingIssues.length > 0 ? job.blockingIssues : [...job.remainingMissing, ...job.unmatchedQuestions];
    const remainingCount = remainingIssues.length;
    console.log(`- ${job.title} @ ${job.company}: ${filledCount} filled, ${remainingCount} remaining issue(s).`);

    if (job.blockingIssues.length > 0) {
      console.log(`  blocking: ${job.blockingIssues.join(" | ")}`);
      continue;
    }

    if (job.remainingMissing.length > 0) {
      console.log(`  missing: ${job.remainingMissing.join(" | ")}`);
    }

    if (job.unmatchedQuestions.length > 0) {
      console.log(`  unmatched: ${job.unmatchedQuestions.join(" | ")}`);
    }
  }

  console.log(`Wrote smoke summary to ${summaryPath}`);
}

function readOptionValue(argv, prefix) {
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function readListOption(argv, prefix) {
  const raw = readOptionValue(argv, prefix);
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
