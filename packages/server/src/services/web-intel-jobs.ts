/**
 * WebIntel Jobs — tracks active crawl/research jobs per session.
 * Enforces concurrency limits and cleanup on session end.
 */

import { createLogger } from "../logger.js";
import { getCrawlStatus, type CrawlJob as _CrawlJob } from "./web-intel.js";

const log = createLogger("web-intel-jobs");

const MAX_JOBS_PER_SESSION = 1;
const MAX_GLOBAL_JOBS = 3;
const JOB_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface WebIntelJob {
  id: string;
  type: "crawl" | "research";
  sessionId: string;
  url: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
}

/** Active jobs by job ID */
const activeJobs = new Map<string, WebIntelJob>();

/** Session → job IDs mapping */
const sessionJobs = new Map<string, Set<string>>();

/**
 * Register a new job. Returns false if concurrency limits exceeded.
 */
export function registerJob(job: Omit<WebIntelJob, "startedAt" | "status">): boolean {
  // Check global limit
  const runningCount = [...activeJobs.values()].filter((j) => j.status === "running").length;
  if (runningCount >= MAX_GLOBAL_JOBS) {
    log.warn("Global job limit reached", { limit: MAX_GLOBAL_JOBS });
    return false;
  }

  // Check per-session limit
  const sessionJobSet = sessionJobs.get(job.sessionId) ?? new Set<string>();
  const sessionRunning = [...sessionJobSet].filter((id) => {
    const j = activeJobs.get(id);
    return j?.status === "running";
  }).length;

  if (sessionRunning >= MAX_JOBS_PER_SESSION) {
    log.warn("Session job limit reached", {
      sessionId: job.sessionId,
      limit: MAX_JOBS_PER_SESSION,
    });
    return false;
  }

  const fullJob: WebIntelJob = {
    ...job,
    status: "running",
    startedAt: Date.now(),
  };

  activeJobs.set(job.id, fullJob);
  sessionJobSet.add(job.id);
  sessionJobs.set(job.sessionId, sessionJobSet);

  // Auto-timeout
  setTimeout(() => {
    const j = activeJobs.get(job.id);
    if (j?.status === "running") {
      j.status = "failed";
      j.error = "Job timed out";
      j.completedAt = Date.now();
      log.warn("Job timed out", { jobId: job.id, type: job.type });
    }
  }, JOB_TIMEOUT_MS);

  return true;
}

/**
 * Update job status.
 */
export function updateJob(
  jobId: string,
  update: Partial<Pick<WebIntelJob, "status" | "result" | "error">>,
): void {
  const job = activeJobs.get(jobId);
  if (!job) return;

  if (update.status) job.status = update.status;
  if (update.result !== undefined) job.result = update.result;
  if (update.error !== undefined) job.error = update.error;

  if (update.status === "completed" || update.status === "failed") {
    job.completedAt = Date.now();
  }
}

/**
 * Get job by ID.
 */
export function getJob(jobId: string): WebIntelJob | undefined {
  return activeJobs.get(jobId);
}

/**
 * List all jobs for a session.
 */
export function getSessionJobs(sessionId: string): WebIntelJob[] {
  const jobIds = sessionJobs.get(sessionId);
  if (!jobIds) return [];
  return [...jobIds]
    .map((id) => activeJobs.get(id))
    .filter((j): j is WebIntelJob => j !== undefined);
}

/**
 * List all active jobs.
 */
export function getAllJobs(): WebIntelJob[] {
  return [...activeJobs.values()];
}

/**
 * Clean up all jobs for a session (called on session end).
 */
export function cleanupSessionJobs(sessionId: string): void {
  const jobIds = sessionJobs.get(sessionId);
  if (!jobIds) return;

  for (const id of jobIds) {
    const job = activeJobs.get(id);
    if (job?.status === "running") {
      job.status = "failed";
      job.error = "Session ended";
      job.completedAt = Date.now();
    }
    // Keep completed jobs in memory for a bit (they'll be GC'd naturally)
  }

  sessionJobs.delete(sessionId);
}

/**
 * Poll a crawl job and update status.
 */
export async function pollCrawlJob(jobId: string): Promise<WebIntelJob | null> {
  const job = activeJobs.get(jobId);
  if (!job || job.type !== "crawl") return null;
  if (job.status !== "running") return job;

  const crawlStatus = await getCrawlStatus(jobId);
  if (!crawlStatus) return job;

  if (crawlStatus.status === "completed") {
    job.status = "completed";
    job.result = crawlStatus.pages;
    job.completedAt = Date.now();
  } else if (crawlStatus.status === "failed") {
    job.status = "failed";
    job.error = crawlStatus.error ?? "Crawl failed";
    job.completedAt = Date.now();
  }

  return job;
}
