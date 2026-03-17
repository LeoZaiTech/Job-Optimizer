#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
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

  const autofillArgs = [path.join("scripts", "autofill-greenhouse.mjs"), kitPath, "--headless"];
  if (all) {
    autofillArgs.push("--all");
  } else if (jobId) {
    autofillArgs.push(`--job=${jobId}`);
  }

  await runNodeCommand(autofillArgs);

  const rawReport = JSON.parse(await fs.readFile(buildReportPath(kitPath), "utf8"));
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
    const fieldsMissing = Array.isArray(job.fieldsMissing) ? job.fieldsMissing : [];
    const unmatchedQuestions = Array.isArray(job.unmatchedQuestions) ? job.unmatchedQuestions : [];
    const ignored = fieldsMissing.filter((item) => options.ignoredMissing.includes(item));
    const remainingMissing = fieldsMissing.filter((item) => !options.ignoredMissing.includes(item));
    const remainingIssues = [...remainingMissing, ...unmatchedQuestions];

    return {
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
    const remainingCount = job.remainingMissing.length + job.unmatchedQuestions.length;
    console.log(`- ${job.title} @ ${job.company}: ${filledCount} filled, ${remainingCount} remaining issue(s).`);

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

async function runNodeCommand(args) {
  const nodeBinary = await resolveNodeBinary();

  await new Promise((resolve, reject) => {
    const child = spawn(nodeBinary, args, {
      cwd: PROJECT_ROOT,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Greenhouse autofill exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function resolveNodeBinary() {
  if (process.execPath) {
    try {
      await fs.access(process.execPath);
      return process.execPath;
    } catch (error) {
      // Fall back to PATH lookup below.
    }
  }

  return "node";
}
