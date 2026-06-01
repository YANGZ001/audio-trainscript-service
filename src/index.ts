import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { downloadBilibiliAudio } from './services/bilibili';
import { cleanupOrphanedGeminiFiles, transcribeAudio } from './services/gemini';

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3000);

cleanupOrphanedGeminiFiles().catch((err) =>
  console.error('Startup Gemini cleanup failed:', err),
);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.post('/api/transcribe', async (req: Request, res: Response) => {
  const { type, url } = req.body as { type?: string; url?: string };

  if (type !== 'bilibili' || typeof url !== 'string' || !url) {
    res.status(400).json({ error: 'Request body must include type: "bilibili" and a url string' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const tempFile = path.join(os.tmpdir(), `bilibili-${Date.now()}.m4a`);

  // res 'close' fires when the socket drops mid-stream (real client disconnect).
  // req 'close' fires as soon as the request body is consumed — too early for our purposes.
  let clientGone = false;
  res.on('close', () => {
    if (!res.writableFinished) clientGone = true;
  });

  try {
    await downloadBilibiliAudio(url, tempFile, (progress) => {
      if (!clientGone) sendEvent('downloading', { progress });
    });

    if (clientGone) return;
    sendEvent('uploading', {});

    const transcript = await transcribeAudio(tempFile, () => {
      if (!clientGone) sendEvent('transcribing', {});
    });

    if (!clientGone) sendEvent('done', transcript);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[transcribe] ${url} —`, err);
    sendEvent('error', { error: message });
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Audio Trainscript Service listening on port ${PORT}`);
});
