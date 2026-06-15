import logger from '../logger';
import {
  claimNextJob,
  setJobStage,
  markJobDone,
  markJobFailed,
  insertTranscription,
  logApiCall,
  countApiCalls,
  requeueProcessingJobs,
  pruneDoneJobs,
} from '../db';
import { transcribeFromUrl } from '../services/transcribePipeline';
import { GEMINI_MODEL } from '../services/gemini';
import { getRateLimit } from '../config/rateLimits';

const IDLE_POLL_MS = 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DONE_JOB_TTL_MS = 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 2000;
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

// Blocks until dispatching a request for `model` would stay within both its
// per-minute and per-day caps. Re-checks periodically as old calls age out.
async function waitForRateLimit(model: string): Promise<void> {
  const { rpm, rpd } = getRateLimit(model);
  let logged = false;
  while (true) {
    const inMinute = countApiCalls(model, MINUTE_MS);
    const inDay = countApiCalls(model, DAY_MS);
    if (inMinute < rpm && inDay < rpd) return;
    if (!logged) {
      logger.info({ model, inMinute, rpm, inDay, rpd }, 'rate limit reached, waiting');
      logged = true;
    }
    await sleep(inMinute >= rpm ? 2000 : 30000);
  }
}

async function processJob(job: { id: number; source_url: string; model: string | null }): Promise<void> {
  const log = logger.child({ jobId: job.id });
  const model = job.model ?? GEMINI_MODEL;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Each attempt is a real provider request — gate and record it against the limits.
    await waitForRateLimit(model);
    logApiCall(model);

    try {
      const { source_type, transcript, meta } = await transcribeFromUrl(job.source_url, job.model ?? undefined, {
        onStage: (stage) => setJobStage(job.id, stage),
        onDownloadProgress: (progress) => setJobStage(job.id, 'downloading', progress),
      });

      const transcriptionId = insertTranscription({
        source_type,
        source_url: job.source_url,
        title: meta.title,
        owner_name: meta.ownerName,
        duration: meta.duration,
        transcript,
      });
      markJobDone(job.id, transcriptionId);
      log.info({ chars: transcript.length, model, attempt }, 'job done');
      return;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS && isRetryable(err)) {
        const waitMs = RETRY_BASE_MS * 2 ** (attempt - 1);
        log.warn({ attempt, waitMs, err: errMessage(err) }, 'transient error, retrying');
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
}

async function loop(): Promise<void> {
  for (;;) {
    pruneDoneJobs(DONE_JOB_TTL_MS);

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
