import logger from '../logger';
import {
  claimNextJob,
  setJobStage,
  setJobTitle,
  markJobDone,
  markJobFailed,
  insertTranscription,
  logApiCall,
  countApiCalls,
  requeueProcessingJobs,
  pruneDoneJobs,
} from '../db';
import { transcribeFromUrl, pruneAudioCache } from '../services/transcribePipeline';
import { getRateLimit, getFallbackChain } from '../config/rateLimits';

const IDLE_POLL_MS = 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DONE_JOB_TTL_MS = 60 * 1000;
const WAIT_POLL_MS = 2000;
const RETRYABLE_NET_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ECONNREFUSED']);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Transient failures worth retrying: provider 5xx (e.g. UNAVAILABLE) and common
// network blips. 429 is NOT retried here — rate limiting is owned by
// waitForRateLimit; a 429 means the provider's quota is spent, so retrying with
// a short backoff would just burn more. Permanent errors (4xx/auth/validation)
// are not retried either.
function isRetryable(err: unknown): boolean {
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number') return status >= 500;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string') return RETRYABLE_NET_CODES.has(code);
  return false;
}

// @google/genai ApiError.message is a JSON string; surface the human-readable
// inner message rather than the raw blob.
function errMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'Unknown error';
  try {
    const parsed = JSON.parse(err.message) as { error?: { message?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    /* message is not JSON */
  }
  return err.message;
}

// True when a request for `model` is within both its per-minute and per-day caps.
function hasQuota(model: string): boolean {
  const { rpm, rpd } = getRateLimit(model);
  return countApiCalls(model, MINUTE_MS) < rpm && countApiCalls(model, DAY_MS) < rpd;
}

// Blocks until one of `models` has a free slot, then returns it.
async function waitForSoonest(models: string[]): Promise<string> {
  let logged = false;
  for (;;) {
    const available = models.find(hasQuota);
    if (available) return available;
    if (!logged) {
      logger.info({ models }, 'all fallback models capped, waiting');
      logged = true;
    }
    await sleep(WAIT_POLL_MS);
  }
}

// Transcribes a job by walking the fallback chain: prefer the first model with
// quota, skip capped ones (waiting only when all are capped), and step down to
// the next model on a transient error. Permanent errors fail fast.
async function processJob(job: { id: number; source_url: string }): Promise<void> {
  const log = logger.child({ jobId: job.id });
  const chain = getFallbackChain();
  const tried = new Set<string>();
  let lastErr: unknown = new Error('No fallback models available');

  for (;;) {
    const remaining = chain.filter((m) => !tried.has(m));
    if (remaining.length === 0) throw lastErr;

    // Prefer a model with quota now; otherwise wait for the soonest to free.
    const model = remaining.find(hasQuota) ?? (await waitForSoonest(remaining));

    logApiCall(model);
    try {
      const { source_type, content_id, transcript, meta } = await transcribeFromUrl(job.source_url, model, {
        onStage: (stage) => setJobStage(job.id, stage),
        onDownloadProgress: (progress) => setJobStage(job.id, 'downloading', progress),
        onTitle: (title) => setJobTitle(job.id, title),
      });

      const transcriptionId = insertTranscription({
        source_type,
        content_id,
        source_url: job.source_url,
        title: meta.title,
        owner_name: meta.ownerName,
        duration: meta.duration,
        transcript,
        model,
      });
      markJobDone(job.id, transcriptionId);
      log.info({ chars: transcript.length, model }, 'job done');
      return;
    } catch (err) {
      if (!isRetryable(err)) throw err; // permanent — fail fast, no step down
      lastErr = err;
      tried.add(model);
      log.warn({ model, err: errMessage(err) }, 'transient error, stepping down to next model');
    }
  }
}

let lastAudioSweep = 0;

async function loop(): Promise<void> {
  for (;;) {
    pruneDoneJobs(DONE_JOB_TTL_MS);

    // Evict stale audio cache files at most once per day, so the cache volumes
    // don't grow unbounded from one-off transcriptions.
    if (Date.now() - lastAudioSweep >= DAY_MS) {
      lastAudioSweep = Date.now();
      pruneAudioCache();
    }

    let job;
    try {
      job = claimNextJob();
    } catch (err) {
      logger.error({ err }, 'failed to claim next job');
      await sleep(IDLE_POLL_MS);
      continue;
    }

    if (!job) {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    try {
      await processJob(job);
    } catch (err) {
      logger.child({ jobId: job.id }).error({ err }, 'job failed');
      markJobFailed(job.id, errMessage(err));
    }
  }
}

let started = false;

export function startWorker(): void {
  if (started) return;
  started = true;
  const requeued = requeueProcessingJobs();
  if (requeued > 0) logger.info({ requeued }, 'requeued orphaned processing jobs');
  logger.info('queue worker started');
  loop().catch((err) => logger.error({ err }, 'worker loop crashed'));
}
