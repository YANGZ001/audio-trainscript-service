import axios from 'axios';
import * as fs from 'fs';

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

const BILIBILI_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com',
};

export function extractBvid(url: string): string {
  const match = url.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
  if (!match) throw new Error(`Cannot extract BVID from URL: ${url}`);
  return match[1];
}

async function getCid(bvid: string, sessdata: string): Promise<number> {
  const res = await axios.get<{ code: number; message: string; data: { cid: number } }>(
    'https://api.bilibili.com/x/web-interface/view',
    {
      params: { bvid },
      headers: { ...BILIBILI_HEADERS, Cookie: `SESSDATA=${sessdata}` },
      timeout: 15_000,
    },
  );
  if (res.data.code !== 0) {
    throw new Error(`Bilibili view API error (${res.data.code}): ${res.data.message}`);
  }
  return res.data.data.cid;
}

async function getAudioStreamUrl(bvid: string, cid: number, sessdata: string): Promise<string> {
  // fnval=16 requests DASH format which separates audio/video streams.
  // If this endpoint returns a WBI signing error, switch to /x/player/wbi/playurl
  // and implement WBI signing (https://github.com/SocialSisterYi/bilibili-API-collect).
  const res = await axios.get<{
    code: number;
    message: string;
    data: { dash: { audio: Array<{ bandwidth: number; baseUrl: string; base_url: string }> } };
  }>('https://api.bilibili.com/x/player/playurl', {
    params: { bvid, cid, fnval: 16, fnver: 0, fourk: 1 },
    headers: { ...BILIBILI_HEADERS, Cookie: `SESSDATA=${sessdata}` },
    timeout: 15_000,
  });
  if (res.data.code !== 0) {
    throw new Error(`Bilibili playurl API error (${res.data.code}): ${res.data.message}`);
  }
  const streams = res.data.data?.dash?.audio;
  if (!streams?.length) throw new Error('No audio streams in Bilibili playurl response');
  // Pick highest bandwidth stream
  const best = [...streams].sort((a, b) => b.bandwidth - a.bandwidth)[0];
  return best.baseUrl ?? best.base_url;
}

export async function downloadBilibiliAudio(
  url: string,
  destPath: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const sessdata = process.env.BILIBILI_SESSION_TOKEN;
  if (!sessdata) throw new Error('BILIBILI_SESSION_TOKEN is not set');
  const bvid = extractBvid(url);
  const cid = await getCid(bvid, sessdata);
  const audioUrl = await getAudioStreamUrl(bvid, cid, sessdata);

  const response = await axios.get<NodeJS.ReadableStream>(audioUrl, {
    responseType: 'stream',
    headers: { ...BILIBILI_HEADERS, Cookie: `SESSDATA=${sessdata}` },
    // axios timeout covers connection + first byte only; stream duration is unbounded.
    // Real download timeout is enforced by the 5-min socket idle check below.
    timeout: 30_000,
    maxRedirects: 5,
  });

  const totalBytes = parseInt(String(response.headers['content-length'] ?? '0'), 10);
  let receivedBytes = 0;
  let sizeError: Error | undefined;

  return new Promise<void>((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);

    response.data.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_FILE_SIZE) {
        sizeError = new Error('Audio file exceeds the 200MB size limit');
        writer.destroy(sizeError);
        (response.data as NodeJS.ReadableStream & { destroy(): void }).destroy();
        return;
      }
      if (totalBytes > 0) {
        onProgress(Math.round((receivedBytes / totalBytes) * 100));
      }
    });

    response.data.pipe(writer);
    writer.on('finish', () => (sizeError ? reject(sizeError) : resolve()));
    writer.on('error', (err) => reject(sizeError ?? err));
    response.data.on('error', (err) => reject(sizeError ?? err));
  });
}
