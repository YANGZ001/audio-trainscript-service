import axios from 'axios';
import * as fs from 'fs';
import logger from '../logger';
import { TranscriptMeta } from './gemini';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

export function extractXiaoyuzhouEpisodeId(url: string): string {
  const match = url.match(/episode\/([0-9a-f]{24})/i);
  if (!match) throw new Error(`Cannot extract Xiaoyuzhou episode ID from URL: ${url}`);
  return match[1];
}

interface XiaoyuzhouEpisode {
  title?: string;
  description?: string;
  duration?: number;
  enclosure?: { url?: string };
  media?: { source?: { url?: string } };
  podcast?: { title?: string };
}

export async function fetchXiaoyuzhouEpisodeData(
  episodeId: string,
): Promise<{ audioUrl: string; meta: TranscriptMeta }> {
  const res = await axios.get<string>(
    `https://www.xiaoyuzhoufm.com/episode/${episodeId}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      timeout: 15_000,
    },
  );

  if (res.status !== 200) throw new Error(`Xiaoyuzhou page returned ${res.status}: ${episodeId}`);

  const match = res.data.match(/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error(`Cannot find __NEXT_DATA__ on Xiaoyuzhou episode page: ${episodeId}`);

  const nextData = JSON.parse(match[1]) as { props?: { pageProps?: { episode?: XiaoyuzhouEpisode } } };
  const episode = nextData?.props?.pageProps?.episode;
  if (!episode) throw new Error(`Episode data not found in page: ${episodeId}`);

  const audioUrl = episode?.enclosure?.url ?? episode?.media?.source?.url;
  if (!audioUrl) throw new Error(`No audio URL found for Xiaoyuzhou episode: ${episodeId}`);

  const meta: TranscriptMeta = {};
  if (episode.title) meta.title = episode.title;
  if (episode.podcast?.title) meta.ownerName = episode.podcast.title;
  if (episode.description) meta.desc = episode.description;
  if (episode.duration != null) meta.duration = episode.duration;

  return { audioUrl, meta };
}

export async function downloadXiaoyuzhouAudio(
  audioUrl: string,
  destPath: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const log = logger.child({ tag: 'xiaoyuzhou' });

  const response = await axios.get<NodeJS.ReadableStream>(audioUrl, {
    responseType: 'stream',
    timeout: 30_000,
    maxRedirects: 5,
  });

  log.info('downloading Xiaoyuzhou audio');
  const totalBytes = parseInt(String(response.headers['content-length'] ?? '0'), 10);
  let receivedBytes = 0;
  let sizeError: Error | undefined;

  return new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);

    response.data.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_FILE_SIZE) {
        sizeError = new Error('Audio file exceeds the 500 MB size limit');
        writer.destroy(sizeError);
        (response.data as NodeJS.ReadableStream & { destroy(): void }).destroy();
        return;
      }
      if (totalBytes > 0) {
        onProgress(Math.round((receivedBytes / totalBytes) * 100));
      }
    });

    response.data.pipe(writer);
    writer.on('finish', () => {
      if (sizeError) {
        try { fs.unlinkSync(destPath); } catch {}
        reject(sizeError);
        return;
      }
      resolve();
    });
    writer.on('error', (err) => {
      try { fs.unlinkSync(destPath); } catch {}
      reject(sizeError ?? err);
    });
    response.data.on('error', (err) => {
      try { fs.unlinkSync(destPath); } catch {}
      reject(sizeError ?? err);
    });
  });
}
