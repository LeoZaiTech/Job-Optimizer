export function normalizeRemoteMode(value) {
  return ["any", "only", "preferred"].includes(String(value || "").trim())
    ? String(value).trim()
    : "preferred";
}

export function normalizeExcludedLocations(value) {
  const parts = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);

  return Array.from(
    new Set(
      parts
        .map((part) => String(part || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function humanizeRemoteMode(value) {
  return (
    {
      any: "Any location",
      only: "Remote only",
      preferred: "Remote preferred"
    }[normalizeRemoteMode(value)] || "Remote preferred"
  );
}

export function classifyDiscoveryLocation(job) {
  const text = String(
    [job.location || "", job.description || "", job.title || "", job.employmentType || ""].join(" ")
  )
    .trim()
    .toLowerCase();

  if (!text) {
    return job.remote ? "remote" : "unclear";
  }

  const hasRemoteSignal =
    /\b(remote(?:[- ]first)?|fully remote|100% remote|distributed|work from home|work from anywhere|telecommut(?:e|ing)|telework|home[- ]based|virtual)\b/i.test(
      text
    ) || /\banywhere in\b/i.test(text);
  const hasRemoteOptionSignal =
    /\b(remote (?:within|in)|open to remote|remote eligible|remote available|can be remote|option to work remotely)\b/i.test(
      text
    );
  const hasRemoteExclusion =
    /\b(not remote|non[- ]remote|no remote|remote not available|cannot be performed remotely|on[- ]site only|onsite only|hybrid only)\b/i.test(
      text
    );
  const hasLocationBoundSignal =
    /\b(hybrid|on[- ]site|onsite|in[- ]office|in office|office[- ]based|must be based|must be located|relocation|commute)\b/i.test(
      text
    );

  if ((job.remote || hasRemoteSignal || hasRemoteOptionSignal) && !hasRemoteExclusion && !hasLocationBoundSignal) {
    return "remote";
  }

  if (hasRemoteExclusion || hasLocationBoundSignal) {
    return "location-bound";
  }

  return job.remote ? "remote" : "unclear";
}

export function applyDiscoveryRemoteMode(jobs, remoteMode) {
  const normalizedMode = normalizeRemoteMode(remoteMode);
  const remoteJobs = [];
  const unclearJobs = [];
  const locationBoundJobs = [];

  jobs.forEach((job) => {
    const bucket = classifyDiscoveryLocation(job);

    if (bucket === "remote") {
      remoteJobs.push(job);
      return;
    }

    if (bucket === "location-bound") {
      locationBoundJobs.push(job);
      return;
    }

    unclearJobs.push(job);
  });

  if (normalizedMode === "only") {
    return remoteJobs;
  }

  if (normalizedMode === "preferred") {
    if (remoteJobs.length > 0) {
      const fallbackCount = Math.min(unclearJobs.length, remoteJobs.length >= 5 ? 2 : 1);
      return [...remoteJobs, ...unclearJobs.slice(0, fallbackCount)];
    }

    if (unclearJobs.length > 0) {
      return unclearJobs.slice(0, Math.min(unclearJobs.length, 3));
    }

    return locationBoundJobs.slice(0, Math.min(locationBoundJobs.length, 2));
  }

  return jobs;
}

export function filterJobsByExcludedLocations(jobs, excludedLocations) {
  const normalizedExclusions = normalizeExcludedLocations(excludedLocations);

  if (normalizedExclusions.length === 0) {
    return {
      excludedCount: 0,
      excludedJobs: [],
      excludedLocations: [],
      jobs: [...jobs]
    };
  }

  const keptJobs = [];
  const excludedJobs = [];

  jobs.forEach((job) => {
    if (jobMatchesExcludedLocation(job, normalizedExclusions)) {
      excludedJobs.push(job);
      return;
    }

    keptJobs.push(job);
  });

  return {
    excludedCount: excludedJobs.length,
    excludedJobs,
    excludedLocations: normalizedExclusions,
    jobs: keptJobs
  };
}

function jobMatchesExcludedLocation(job, excludedLocations) {
  const blob = String([job.location || "", job.description || "", job.title || "", job.company || ""].join(" "))
    .trim()
    .toLowerCase();

  if (!blob) {
    return false;
  }

  return excludedLocations.some((phrase) => blob.includes(phrase));
}
