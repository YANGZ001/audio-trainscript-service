import axios from 'axios';
import * as fs from 'fs';
import logger from '../logger';
import { TranscriptMeta } from './gemini';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

const SNIPD_GRAPHQL_URL = 'https://api.snipd.com/v1/public/graphql';

export function extractSnipdEpisodeId(url: string): string {
  const match = url.match(/episode\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (!match) throw new Error(`Cannot extract Snipd episode ID from URL: ${url}`);
  return match[1];
}

export async function fetchSnipdEpisodeData(
  episodeId: string,
): Promise<{ audioUrl: string; meta: TranscriptMeta }> {
  const snipdApiKey = process.env.SNIPD_API_KEY;
  if (!snipdApiKey) throw new Error('SNIPD_API_KEY is not set');

  const res = await axios.post<{
    data?: {
      episodes_by_pk?: {
        title?: string;
        audio_url?: string;
        description?: string;
        duration_seconds?: number;
        show?: { title?: string };
      } | null;
    };
    errors?: Array<{ message: string }>;
  }>(
    SNIPD_GRAPHQL_URL,
    {
      query: `query GetSnipdEpisode($id: uuid!) {
        episodes_by_pk(id: $id) {
          title
          audio_url
          description
          duration_seconds
          show { title }
        }
      }`,
      variables: { id: episodeId },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': snipdApiKey,
        origin: 'https://share.snipd.com',
      },
      timeout: 15_000,
    },
  );

  if (res.data.errors?.length) {
    throw new Error(`Snipd API error: ${res.data.errors[0].message}`);
  }

  const ep = res.data.data?.episodes_by_pk;
  if (!ep) throw new Error(`Snipd episode not found: ${episodeId}`);
  if (!ep.audio_url) throw new Error(`Snipd episode has no audio URL: ${episodeId}`);

  const meta: TranscriptMeta = {};
  if (ep.title) meta.title = ep.title;
  if (ep.show?.title) meta.ownerName = ep.show.title;
  if (ep.description) meta.desc = ep.description;
  if (ep.duration_seconds != null) meta.duration = ep.duration_seconds;

  return { audioUrl: ep.audio_url, meta };
}

export async function downloadSnipdAudio(
  audioUrl: string,
  destPath: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const log = logger.child({ tag: 'snipd' });

  const response = await axios.get<NodeJS.ReadableStream>(audioUrl, {
    responseType: 'stream',
    timeout: 30_000,
    maxRedirects: 5,
  });

  log.info('downloading Snipd audio');
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
