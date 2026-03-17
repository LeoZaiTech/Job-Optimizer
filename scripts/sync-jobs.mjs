import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importJobsFromUrls } from "../lib/job-discovery.mjs";
import { allDiscoverySourceUrls } from "../lib/discovery-sources.mjs";
import {
  applyDiscoveryRemoteMode,
  filterJobsByExcludedLocations,
  humanizeRemoteMode,
  normalizeExcludedLocations,
  normalizeRemoteMode
} from "../lib/discovery-preferences.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jobsPath = path.resolve(__dirname, "../data/jobs.json");
const reportPath = path.resolve(__dirname, "../data/job-sync-report.json");
const args = process.argv.slice(2);
const remoteMode = readRemoteMode(args);
const excludedLocations = readExcludedLocations(args);

async function main() {
  const sourceUrls = allDiscoverySourceUrls();
  const existingJobs = JSON.parse(await readFile(jobsPath, "utf8"));
  const result = await importJobsFromUrls(sourceUrls);
  const remoteFilteredJobs = applyDiscoveryRemoteMode(result.jobs, remoteMode);
  const locationFilterResult = filterJobsByExcludedLocations(remoteFilteredJobs, excludedLocations);
  const filteredJobs = locationFilterResult.jobs;
  const preservedJobs = existingJobs.filter((job) => job.source === "manual-seed");
  const mergedJobs = dedupeJobs([...preservedJobs, ...filteredJobs]).sort(sortByPostedDateDesc);

  const report = {
    excludedLocationCount: locationFilterResult.excludedCount,
    excludedLocations,
    syncedAt: new Date().toISOString(),
    remoteMode,
    remoteModeLabel: humanizeRemoteMode(remoteMode),
    sourceCount: sourceUrls.length,
    sourceErrors: result.errors,
    sourceSummaries: result.sources,
    totalFound: result.jobs.length,
    totalKept: filteredJobs.length,
    totalWritten: mergedJobs.length,
    updatedJobsFile: false
  };

  if (filteredJobs.length === 0) {
    report.totalWritten = existingJobs.length;
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.warn("No jobs passed the current discovery filter. Kept data/jobs.json unchanged.");
    console.warn(`Wrote sync report to ${reportPath}`);
    process.exitCode = result.errors.length > 0 ? 1 : 0;
    return;
  }

  await writeFile(jobsPath, JSON.stringify(mergedJobs, null, 2));
  report.updatedJobsFile = true;
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(
    `Synced ${filteredJobs.length} ${humanizeRemoteMode(remoteMode).toLowerCase()} role${
      filteredJobs.length === 1 ? "" : "s"
    } from ${sourceUrls.length} source${sourceUrls.length === 1 ? "" : "s"}.`
  );
  if (excludedLocations.length > 0) {
    console.log(
      `Excluded ${locationFilterResult.excludedCount} role${locationFilterResult.excludedCount === 1 ? "" : "s"} by location: ${excludedLocations.join(", ")}.`
    );
  }
  console.log(`Wrote ${mergedJobs.length} jobs to ${jobsPath}`);
  console.log(`Wrote sync report to ${reportPath}`);

  result.errors.forEach((entry) => {
    console.warn(`${entry.input}: ${entry.error}`);
  });
}

function readRemoteMode(args) {
  const rawValue = args.find((arg) => arg.startsWith("--remote-mode="));
  return normalizeRemoteMode(rawValue ? rawValue.split("=")[1] : "preferred");
}

function readExcludedLocations(args) {
  const rawValue = args.find((arg) => arg.startsWith("--exclude-locations="));
  return normalizeExcludedLocations(rawValue ? rawValue.split("=")[1] : "");
}

function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = [job.url || "", job.externalId || "", `${job.company}::${job.title}`.toLowerCase()].join("::");
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function sortByPostedDateDesc(left, right) {
  return String(right.postedAt || "").localeCompare(String(left.postedAt || ""));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
