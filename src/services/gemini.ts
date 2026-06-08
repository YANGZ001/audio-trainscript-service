import { GoogleGenAI } from '@google/genai';
import logger from '../logger';

const GEMINI_MODEL = 'gemini-flash-lite-latest';
const ORPHAN_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function createClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
  return new GoogleGenAI({ apiKey });
}

export interface TranscriptMeta {
  ownerName?: string;
  title?: string;
  desc?: string;
  tname?: string;
  duration?: number;
  dynamic?: string;
}

function buildPrompt(meta?: TranscriptMeta): string {
  const lines: string[] = [];
  if (meta?.title) lines.push(`- Title: ${meta.title}`);
  if (meta?.ownerName) lines.push(`- Channel: ${meta.ownerName}`);
  if (meta?.tname) lines.push(`- Category: ${meta.tname}`);
  if (meta?.duration != null) lines.push(`- Duration: ${meta.duration}s`);
  if (meta?.desc) lines.push(`- Description: ${meta.desc.slice(0, 200)}`);
  if (meta?.dynamic) lines.push(`- Post: ${meta.dynamic.slice(0, 200)}`);

  const contextBlock = lines.length > 0 ? `Video context:\n${lines.join('\n')}\n\n` : '';
  const primarySpeaker = meta?.ownerName ?? 'Speaker A';

  return (
    contextBlock +
    `# Audio Transcriptionist\n` +
    `You are a professional audio transcriptionist. The user will provide an audio input, and you will output the corresponding verbatim transcript. Requirements:\n` +
    `1. Produce a strict word-for-word transcript — omit nothing and do not summarize.\n` +
    `2. Include filler words (um, uh, 嗯, 啊, 那个, etc.) exactly as spoken — do not clean them up.\n` +
    `3. Mark unintelligible audio as [inaudible]. Mark low-confidence words as [unclear: word?].\n` +
    `4. The primary speaker is ${primarySpeaker}. Label each speaker by name or role if identifiable; otherwise use Speaker A, Speaker B.\n` +
    `5. If the recording contains technical terminology, proofread it against context for correctness.\n` +
    `6. Prepend a timestamp to each speaker turn in [MM:SS] format.`
  );
}

export async function transcribeAudio(
  filePath: string,
  onTranscribing: () => void,
  model?: string,
  tag?: string,
  meta?: TranscriptMeta,
): Promise<string> {
  const log = logger.child({ tag: tag ?? 'gemini' });
  const ai = createClient();
  const modelToUse = model ?? GEMINI_MODEL;
  let uploadedName: string | undefined;

  const mimeType = filePath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4';

  try {
    log.info('uploading to Gemini');
    const uploaded = await ai.files.upload({
      file: filePath,
      config: { mimeType },
    });
    uploadedName = uploaded.name;
    log.debug({ state: uploaded.state }, 'Gemini file uploaded');

    // Wait for Gemini to finish processing the uploaded file (max ~5 min)
    let fileInfo = uploaded;
    let pollAttempts = 0;
    const POLL_LIMIT = 100;
    while (fileInfo.state === 'PROCESSING') {
      if (++pollAttempts > POLL_LIMIT) {
        throw new Error('Gemini file processing timed out');
      }
      log.debug({ attempt: pollAttempts }, 'waiting for Gemini processing');
      await new Promise((r) => setTimeout(r, 3000));
      fileInfo = await ai.files.get({ name: uploadedName! });
    }
    if (fileInfo.state === 'FAILED') {
      throw new Error('Gemini file processing failed');
    }
    if (!fileInfo.uri) {
      throw new Error('Gemini file URI missing after upload');
    }

    log.info({ model: modelToUse }, 'file ready, generating transcript');
    onTranscribing();

    const result = await ai.models.generateContent({
      model: modelToUse,
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { mimeType, fileUri: fileInfo.uri } },
            { text: buildPrompt(meta) },
          ],
        },
      ],
    });

    const raw = (result.text ?? '').trim();
    log.info({ chars: raw.length }, 'transcript received');
    return raw;
  } finally {
    if (uploadedName) {
      await ai.files.delete({ name: uploadedName }).catch(() => {});
      log.debug('Gemini file deleted');
    }
  }
}

// Deletes Gemini cloud files older than 1 hour. Called at startup to recover from
// mid-request crashes where the local temp file was cleaned up but the cloud file was not.
export async function cleanupOrphanedGeminiFiles(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) return;
  const ai = createClient();
  const cutoff = Date.now() - ORPHAN_MAX_AGE_MS;
  try {
    const pager = await ai.files.list();
    for await (const file of pager) {
      if (!file.createTime || !file.name) continue;
      const created = new Date(file.createTime as string).getTime();
      if (created < cutoff) {
        await ai.files.delete({ name: file.name }).catch(() => {});
      }
    }
  } catch (err) {
    logger.error({ err }, 'Gemini orphaned file cleanup error');
  }
}
