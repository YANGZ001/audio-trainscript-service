import * as fs from 'fs';
import * as path from 'path';
import logger from '../logger';
import { downloadBilibiliAudio, extractBvid, getVideoMetadata, resolveShortUrl } from './bilibili';
import { downloadSnipdAudio, extractSnipdEpisodeId, fetchSnipdEpisodeData } from './snipd';
import { downloadXiaoyuzhouAudio, extractXiaoyuzhouEpisodeId, fetchXiaoyuzhouEpisodeData } from './xiaoyuzhou';
import { transcribeAudio, TranscriptMeta } from './gemini';

export type SourceType = 'bilibili' | 'snipd' | 'xiaoyuzhou';

const BILIBILI_AUDIO_CACHE_DIR = '/data/bilibili-audio';
const SNIPD_AUDIO_CACHE_DIR = '/data/snipd-audio';
const XIAOYUZHOU_AUDIO_CACHE_DIR = '/data/xiaoyuzhou-audio';
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function detectSource(url: string): SourceType {
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

export interface TranscribeCallbacks {
  onStage: (stage: 'uploading' | 'transcribing') => void;
  onDownloadProgress: (progress: number) => void;
}

interface Prepared {
  audioPath: string;
  meta: TranscriptMeta;
  tag: string;
}

async function prepareBilibili(url: string, cb: TranscribeCallbacks): Promise<Prepared> {
  const t0 = Date.now();
  const canonicalUrl = await resolveShortUrl(url);
  const bvid = extractBvid(canonicalUrl);
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
    await downloadBilibiliAudio(bvid, cid, audioPath, (progress) => cb.onDownloadProgress(progress));
    writeCachedMeta(metaPath, meta);
    const downloadSec = ((Date.now() - t0) / 1000).toFixed(1);
    const downloadMb = (fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1);
    log.info({ mb: downloadMb, sec: downloadSec }, 'download complete');
  }

  return { audioPath, meta, tag: bvid };
}

async function prepareSnipd(url: string, cb: TranscribeCallbacks): Promise<Prepared> {
  const t0 = Date.now();
  const episodeId = extractSnipdEpisodeId(url);
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
    await downloadSnipdAudio(audioUrl, audioPath, (progress) => cb.onDownloadProgress(progress));
    writeCachedMeta(metaPath, meta);
    const downloadSec = ((Date.now() - t0) / 1000).toFixed(1);
    const downloadMb = (fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1);
    log.info({ mb: downloadMb, sec: downloadSec }, 'download complete');
  }

  return { audioPath, meta, tag: episodeId };
}

async function prepareXiaoyuzhou(url: string, cb: TranscribeCallbacks): Promise<Prepared> {
  const t0 = Date.now();
  const episodeId = extractXiaoyuzhouEpisodeId(url);
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
    await downloadXiaoyuzhouAudio(audioUrl, audioPath, (progress) => cb.onDownloadProgress(progress));
    writeCachedMeta(metaPath, meta);
    const downloadSec = ((Date.now() - t0) / 1000).toFixed(1);
    const downloadMb = (fs.statSync(audioPath).size / (1024 * 1024)).toFixed(1);
    log.info({ mb: downloadMb, sec: downloadSec }, 'download complete');
  }

  return { audioPath, meta, tag: episodeId };
}

// Runs the full cache → download → transcribe pipeline for a supported URL.
// Reports progress through callbacks; the caller decides how to surface it.
export async function transcribeFromUrl(
  url: string,
  model: string | undefined,
  cb: TranscribeCallbacks,
): Promise<{ source_type: SourceType; transcript: string; meta: TranscriptMeta }> {
  const source = detectSource(url);

  let prepared: Prepared;
  if (source === 'bilibili') prepared = await prepareBilibili(url, cb);
  else if (source === 'snipd') prepared = await prepareSnipd(url, cb);
  else prepared = await prepareXiaoyuzhou(url, cb);

  cb.onStage('uploading');
  const transcript = await transcribeAudio(
    prepared.audioPath,
    () => cb.onStage('transcribing'),
    model,
    prepared.tag,
    prepared.meta,
  );

  return { source_type: source, transcript, meta: prepared.meta };
}
