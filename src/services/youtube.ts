import axios from 'axios';
import logger from '../logger';
import { TranscriptMeta } from './gemini';

export function extractYoutubeVideoId(url: string): string {
  const match = url.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  if (!match) throw new Error(`Cannot extract YouTube video ID from URL: ${url}`);
  return match[1];
}

export function canonicalYoutubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Best-effort: metadata only enriches the prompt, so failures never block transcription.
export async function fetchYoutubeMeta(videoId: string): Promise<TranscriptMeta> {
  try {
    const res = await axios.get<{ title?: string; author_name?: string }>('https://www.youtube.com/oembed', {
      params: { url: canonicalYoutubeUrl(videoId), format: 'json' },
      timeout: 15_000,
    });
    const meta: TranscriptMeta = {};
    if (res.data.title) meta.title = res.data.title;
    if (res.data.author_name) meta.ownerName = res.data.author_name;
    return meta;
  } catch (err) {
    logger.warn({ err, videoId }, 'YouTube oEmbed metadata fetch failed');
    return {};
  }
}
