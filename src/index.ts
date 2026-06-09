import crypto from 'crypto';
import express, { Request, Response } from 'express';
import * as fs from 'fs';
import logger from './logger';
import multer from 'multer';
import * as os from 'os';
import * as path from 'path';
import { downloadBilibiliAudio, extractBvid, getVideoMetadata, resolveShortUrl } from './services/bilibili';
import { downloadSnipdAudio, extractSnipdEpisodeId, fetchSnipdEpisodeData } from './services/snipd';
import { downloadXiaoyuzhouAudio, extractXiaoyuzhouEpisodeId, fetchXiaoyuzhouEpisodeData } from './services/xiaoyuzhou';
import { cleanupOrphanedGeminiFiles, transcribeAudio, TranscriptMeta } from './services/gemini';

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

const BILIBILI_AUDIO_CACHE_DIR = '/data/bilibili-audio';
const SNIPD_AUDIO_CACHE_DIR = '/data/snipd-audio';
const XIAOYUZHOU_AUDIO_CACHE_DIR = '/data/xiaoyuzhou-audio';
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function detectSource(url: string): 'bilibili' | 'snipd' | 'xiaoyuzhou' {
  if (/bilibili\.com|b23\.tv/i.test(url)) return 'bilibili';
  if (/share\.snipd\.com\/episode\//i.test(url)) return 'snipd';
  if (/xiaoyuzhoufm\.com\/episode\//i.test(url)) return 'xiaoyuzhou';
  throw new Error('Unsupported URL — must be a Bilibili, Snipd, or Xiaoyuzhou episode URL');
}

function isCacheHit(cachePath: string): boolean {
  try {
    const { mtimeMs } = fs.statSync(cachePath);
    return Date.now() - mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function readCachedMeta(metaPath: string): TranscriptMeta | null {
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8')) as TranscriptMeta;
  } catch {
    return null;
  }
}

function writeCachedMeta(metaPath: string, meta: TranscriptMeta): void {
  try {
    fs.writeFileSync(metaPath, JSON.stringify(meta));
  } catch (err) {
    logger.warn({ err, metaPath }, 'failed to write metadata cache');
  }
}

cleanupOrphanedGeminiFiles().catch((err) =>
  logger.error({ err }, 'Startup Gemini cleanup failed'),
);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // res 'close' fires when the socket drops mid-stream (real client disconnect).
  // req 'close' fires as soon as the request body is consumed — too early for our purposes.
  let clientGone = false;
  res.on('close', () => {
    if (!res.writableFinished) clientGone = true;
  });

  let requestTag = 'transcribe';
  const t0 = Date.now();
  const model = typeof req.query.model === 'string' ? req.query.model : undefined;

  try {
    if (source === 'bilibili') {
      const canonicalUrl = await resolveShortUrl(url);
      const bvid = extractBvid(canonicalUrl);
      requestTag = bvid;
      const log = logger.child({ bvid });
      log.info('transcribe request received');

      const audioPath = path.join(BILIBILI_AUDIO_CACHE_DIR, `${bvid}.m4a`);
      const metaPath = path.join(BILIBILI_AUDIO_CACHE_DIR, `${bvid}.json`);

      let meta: TranscriptMeta;

      if (isCacheHit(audioPath)) {
        const cacheMb = (fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1);
        const now = new Date();
        fs.utimesSync(audioPath, now, now);
        const cachedMeta = readCachedMeta(metaPath);
        if (cachedMeta) {
          log.info({ mb: cacheMb }, 'audio cache hit');
          meta = cachedMeta;
        } else {
          log.info({ mb: cacheMb }, 'audio cache hit (meta missing)');
          const sessdata = process.env.BILIBILI_SESSION_TOKEN;
          if (!sessdata) throw new Error('BILIBILI_SESSION_TOKEN is not set');
          const { ownerName, title, desc, tname, duration, dynamic } = await getVideoMetadata(bvid, sessdata);
          meta = { ownerName, title, desc, tname, duration, dynamic };
          writeCachedMeta(metaPath, meta);
        }
      } else {
        const sessdata = process.env.BILIBILI_SESSION_TOKEN;
        if (!sessdata) throw new Error('BILIBILI_SESSION_TOKEN is not set');
        log.debug('fetching video metadata');
        const { cid, ownerName, title, desc, tname, duration, dynamic } = await getVideoMetadata(bvid, sessdata);
        log.debug({ cid }, 'metadata fetched');
        meta = { ownerName, title, desc, tname, duration, dynamic };
        fs.mkdirSync(BILIBILI_AUDIO_CACHE_DIR, { recursive: true });
        await downloadBilibiliAudio(bvid, cid, audioPath, (progress) => {
          if (!clientGone) sendEvent('downloading', { progress });
        });
        writeCachedMeta(metaPath, meta);
        const downloadSec = ((Date.now() - t0) / 1000).toFixed(1);
        const downloadMb = (fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1);
        log.info({ mb: downloadMb, sec: downloadSec }, 'download complete');
      }

      if (clientGone) return;
      sendEvent('uploading', {});

      const transcript = await transcribeAudio(audioPath, () => {
        if (!clientGone) sendEvent('transcribing', {});
      }, model, bvid, meta);

      const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
      log.info({ chars: transcript.length, sec: totalSec, model: model ?? 'gemini-flash-lite-latest' }, 'transcription done');

      if (!clientGone) sendEvent('done', { text: transcript });

    } else if (source === 'snipd') {
      const episodeId = extractSnipdEpisodeId(url);
      requestTag = episodeId;
      const log = logger.child({ episodeId });
      log.info('transcribe request received');

      const audioPath = path.join(SNIPD_AUDIO_CACHE_DIR, `${episodeId}.mp3`);
      const metaPath = path.join(SNIPD_AUDIO_CACHE_DIR, `${episodeId}.json`);

      let meta: TranscriptMeta;

      if (isCacheHit(audioPath)) {
        const cacheMb = (fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1);
        const now = new Date();
        fs.utimesSync(audioPath, now, now);
        const cachedMeta = readCachedMeta(metaPath);
        if (cachedMeta) {
          log.info({ mb: cacheMb }, 'audio cache hit');
          meta = cachedMeta;
        } else {
          log.info({ mb: cacheMb }, 'audio cache hit (meta missing)');
          const { meta: fetchedMeta } = await fetchSnipdEpisodeData(episodeId);
          meta = fetchedMeta;
          writeCachedMeta(metaPath, meta);
        }
      } else {
        log.debug('fetching Snipd episode data');
        const { audioUrl, meta: fetchedMeta } = await fetchSnipdEpisodeData(episodeId);
        log.debug('episode data fetched');
        meta = fetchedMeta;
        fs.mkdirSync(SNIPD_AUDIO_CACHE_DIR, { recursive: true });
        await downloadSnipdAudio(audioUrl, audioPath, (progress) => {
          if (!clientGone) sendEvent('downloading', { progress });
        });
        writeCachedMeta(metaPath, meta);
        const downloadSec = ((Date.now() - t0) / 1000).toFixed(1);
        const downloadMb = (fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1);
        log.info({ mb: downloadMb, sec: downloadSec }, 'download complete');
      }

      if (clientGone) return;
      sendEvent('uploading', {});

      const transcript = await transcribeAudio(audioPath, () => {
        if (!clientGone) sendEvent('transcribing', {});
      }, model, episodeId, meta);

      const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
      log.info({ chars: transcript.length, sec: totalSec, model: model ?? 'gemini-flash-lite-latest' }, 'transcription done');

      if (!clientGone) sendEvent('done', { text: transcript });

    } else if (source === 'xiaoyuzhou') {
      const episodeId = extractXiaoyuzhouEpisodeId(url);
      requestTag = episodeId;
      const log = logger.child({ episodeId });
      log.info('transcribe request received');

      const audioPath = path.join(XIAOYUZHOU_AUDIO_CACHE_DIR, `${episodeId}.m4a`);
      const metaPath = path.join(XIAOYUZHOU_AUDIO_CACHE_DIR, `${episodeId}.json`);

      let meta: TranscriptMeta;

      if (isCacheHit(audioPath)) {
        const cacheMb = (fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1);
        const now = new Date();
        fs.utimesSync(audioPath, now, now);
        const cachedMeta = readCachedMeta(metaPath);
        if (cachedMeta) {
          log.info({ mb: cacheMb }, 'audio cache hit');
          meta = cachedMeta;
        } else {
          log.info({ mb: cacheMb }, 'audio cache hit (meta missing)');
          const { meta: fetchedMeta } = await fetchXiaoyuzhouEpisodeData(episodeId);
          meta = fetchedMeta;
          writeCachedMeta(metaPath, meta);
        }
      } else {
        log.debug('fetching Xiaoyuzhou episode data');
        const { audioUrl, meta: fetchedMeta } = await fetchXiaoyuzhouEpisodeData(episodeId);
        log.debug('episode data fetched');
        meta = fetchedMeta;
        fs.mkdirSync(XIAOYUZHOU_AUDIO_CACHE_DIR, { recursive: true });
        await downloadXiaoyuzhouAudio(audioUrl, audioPath, (progress) => {
          if (!clientGone) sendEvent('downloading', { progress });
        });
        writeCachedMeta(metaPath, meta);
        const downloadSec = ((Date.now() - t0) / 1000).toFixed(1);
        const downloadMb = (fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1);
        log.info({ mb: downloadMb, sec: downloadSec }, 'download complete');
      }

      if (clientGone) return;
      sendEvent('uploading', {});

      const transcript = await transcribeAudio(audioPath, () => {
        if (!clientGone) sendEvent('transcribing', {});
      }, model, episodeId, meta);

      const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
      log.info({ chars: transcript.length, sec: totalSec, model: model ?? 'gemini-flash-lite-latest' }, 'transcription done');

      if (!clientGone) sendEvent('done', { text: transcript });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    logger.child({ tag: requestTag }).error({ err }, 'request error');
    sendEvent('error', { error: message });
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

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Audio Trainscript Service listening');
});
