import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importJobsFromUrls } from "../lib/job-discovery.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jobsPath = path.resolve(__dirname, "../data/jobs.json");
const sourceArgs = process.argv.slice(2);

async function main() {
  if (sourceArgs.length === 0) {
    console.error("Usage: node scripts/fetch-jobs.mjs <board-or-job-url> [more urls...]");
    process.exitCode = 1;
    return;
  }

  const existingJobs = JSON.parse(await readFile(jobsPath, "utf8"));
  const result = await importJobsFromUrls(sourceArgs);

  result.errors.forEach((entry) => {
    console.warn(`${entry.input}: ${entry.error}`);
  });

  const preservedJobs = existingJobs.filter((job) => job.source === "manual-seed");
  const mergedJobs = dedupeJobs([...preservedJobs, ...result.jobs]).sort(
    (left, right) => String(right.postedAt).localeCompare(String(left.postedAt))
  );

  await writeFile(jobsPath, JSON.stringify(mergedJobs, null, 2));
  console.log(`Imported ${result.jobs.length} jobs from ${sourceArgs.length} source(s).`);
  console.log(`Wrote ${mergedJobs.length} jobs to ${jobsPath}`);
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
