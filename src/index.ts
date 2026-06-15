import crypto from 'crypto';
import express, { Request, Response } from 'express';
import * as fs from 'fs';
import logger from './logger';
import multer from 'multer';
import * as os from 'os';
import * as path from 'path';
import { cleanupOrphanedGeminiFiles, transcribeAudio } from './services/gemini';
import { detectSource } from './services/transcribePipeline';
import { listModels } from './config/rateLimits';
import { startWorker } from './queue/worker';
import {
  listTranscriptions,
  deleteTranscription,
  getTranscription,
  enqueueJob,
  listJobs,
  cancelJob,
  getJob,
} from './db';

const app = express();
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

const UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['audio/mp4', 'audio/x-m4a']);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, _file, cb) => cb(null, `upload-${crypto.randomUUID()}.m4a`),
  }),
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIMES.has(file.mimetype) && ext === '.m4a') cb(null, true);
    else cb(new Error(`Only .m4a files accepted (got mime=${file.mimetype}, ext=${ext})`));
  },
});

function runMiddleware(req: Request, res: Response, fn: Function): Promise<void> {
  return new Promise((resolve, reject) => {
    fn(req, res, (err: unknown) => (err ? reject(err) : resolve()));
  });
}

const PORT = Number(process.env.PORT ?? 3000);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

cleanupOrphanedGeminiFiles().catch((err) =>
  logger.error({ err }, 'Startup Gemini cleanup failed'),
);

startWorker();

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// The model picker is driven by the configured models so the UI and rate limits stay in sync.
app.get('/api/models', (_req: Request, res: Response) => {
  res.json({ models: listModels() });
});

app.post('/api/jobs', (req: Request, res: Response) => {
  const { url, model } = req.body as { url?: string; model?: string };

  if (typeof url !== 'string' || !url) {
    res.status(400).json({ error: 'Request body must include a url string' });
    return;
  }

  let source: 'bilibili' | 'snipd' | 'xiaoyuzhou';
  try {
    source = detectSource(url);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unsupported URL' });
    return;
  }

  const id = enqueueJob({
    source_type: source,
    source_url: url,
    model: typeof model === 'string' && model.trim() ? model : undefined,
  });
  logger.child({ jobId: id }).info({ source }, 'job enqueued');
  res.status(201).json({ id, status: 'queued' });
});

app.get('/api/jobs', (_req: Request, res: Response) => {
  try {
    res.json(listJobs());
  } catch (err) {
    logger.error({ err }, 'failed to list jobs');
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/jobs/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    if (!cancelJob(id)) {
      res.status(409).json({ error: 'Only queued or failed jobs can be removed' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, 'failed to cancel job');
    res.status(500).json({ error: 'Database error' });
  }
});

// Backward-compatible synchronous SSE endpoint. Enqueues a (FIFO) job and tails
// its progress, translating job state into the legacy event stream so existing
// consumers (e.g. bilibili-copilot) need no changes.
app.post('/api/transcribe', async (req: Request, res: Response) => {
  const { url } = req.body as { url?: string };

  if (typeof url !== 'string' || !url) {
    res.status(400).json({ error: 'Request body must include a url string' });
    return;
  }

  let source: 'bilibili' | 'snipd' | 'xiaoyuzhou';
  try {
    source = detectSource(url);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unsupported URL' });
    return;
  }

  const model = typeof req.query.model === 'string' && req.query.model.trim() ? req.query.model : undefined;
  const jobId = enqueueJob({ source_type: source, source_url: url, model });
  const log = logger.child({ jobId, tag: 'transcribe' });
  log.info({ source }, 'transcribe request enqueued');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // res 'close' fires when the socket drops mid-stream (real client disconnect).
  let clientGone = false;
  res.on('close', () => {
    if (!res.writableFinished) clientGone = true;
  });

  let lastStage: string | null = null;
  let lastProgress: number | null = null;

  try {
    for (;;) {
      // Client disconnected — stop tailing; the worker keeps processing in the background.
      if (clientGone) return;

      const job = getJob(jobId);
      if (!job) {
        sendEvent('error', { error: 'Job not found' });
        return;
      }

      if (job.stage === 'downloading') {
        if (job.progress !== lastProgress) {
          sendEvent('downloading', { progress: job.progress ?? 0 });
          lastProgress = job.progress;
        }
      } else if (job.stage && job.stage !== lastStage) {
        sendEvent(job.stage, {});
      }
      if (job.stage) lastStage = job.stage;

      if (job.status === 'done') {
        const row = job.transcription_id != null ? getTranscription(job.transcription_id) : undefined;
        sendEvent('done', { text: row?.transcript ?? '' });
        return;
      }
      if (job.status === 'failed') {
        sendEvent('error', { error: job.error ?? 'Transcription failed' });
        return;
      }

      await sleep(500);
    }
  } finally {
    res.end();
  }
});

app.post('/api/upload-transcribe', async (req: Request, res: Response) => {
  try {
    await runMiddleware(req, res, upload.single('file'));
  } catch (err: unknown) {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'File exceeds 100 MB limit.' });
    } else {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload failed.' });
    }
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'Missing "file" field in multipart body.' });
    return;
  }

  const tempFile = req.file.path;
  const fileTag = req.file.originalname;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let clientGone = false;
  res.on('close', () => {
    if (!res.writableFinished) clientGone = true;
  });

  const log = logger.child({ fileTag });
  log.info('upload-transcribe request received');
  const model = typeof req.query.model === 'string' ? req.query.model : undefined;

  try {
    if (!clientGone) sendEvent('uploading', {});
    const transcript = await transcribeAudio(tempFile, () => {
      if (!clientGone) sendEvent('transcribing', {});
    }, model, fileTag);
    log.info({ chars: transcript.length, model: model ?? 'gemini-3.1-flash-lite' }, 'transcription done');
    if (!clientGone) sendEvent('done', { text: transcript });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error({ err }, 'request error');
    sendEvent('error', { error: message });
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    res.end();
  }
});

app.get('/api/transcriptions', (_req: Request, res: Response) => {
  try {
    res.json(listTranscriptions());
  } catch (err) {
    logger.error({ err }, 'failed to list transcriptions');
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/transcriptions/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    deleteTranscription(id);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, 'failed to delete transcription');
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Audio Trainscript Service listening');
});
