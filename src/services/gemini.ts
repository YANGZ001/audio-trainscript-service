import { GoogleGenAI } from '@google/genai';
import logger from '../logger';

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const ORPHAN_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

export type Segment = { from: number; to: number; content: string };

function createClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');
  return new GoogleGenAI({ apiKey });
}

const TRANSCRIPTION_PROMPT =
  'Transcribe this audio file. Return ONLY a raw JSON array with no markdown fences, ' +
  'no explanation, and no trailing text. Each element must have exactly three fields: ' +
  '"from" (start time in seconds, number), "to" (end time in seconds, number), ' +
  '"content" (the spoken text for that segment, string). ' +
  'Do NOT include any bounding boxes, box_2d fields, spatial coordinates, labels, or visual annotations. ' +
  'Example: [{"from":0,"to":4,"content":"Hello."},{"from":4,"to":8,"content":"Next sentence."}]';

export async function transcribeAudio(
  filePath: string,
  onTranscribing: () => void,
  model?: string,
  tag?: string,
): Promise<Segment[]> {
  const log = logger.child({ tag: tag ?? 'gemini' });
  const ai = createClient();
  const modelToUse = model ?? GEMINI_MODEL;
  let uploadedName: string | undefined;

  try {
    log.info('uploading to Gemini');
    const uploaded = await ai.files.upload({
      file: filePath,
      config: { mimeType: 'audio/mp4' },
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
            { fileData: { mimeType: 'audio/mp4', fileUri: fileInfo.uri } },
            { text: TRANSCRIPTION_PROMPT },
          ],
        },
      ],
    });

    const raw = (result.text ?? '').trim();
    log.info({ chars: raw.length }, 'transcript received');
    log.debug({ sample: raw.slice(0, 500) }, 'raw response sample');
    // Strip markdown code fences in case Gemini adds them despite the prompt
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    // If direct parse fails, fall back to extracting the outermost [...] block
    // Repair 1: missing closing quote on key — "to:4.5  →  "to":4.5
    const quotFixed = stripped.replace(/"(from|to):(\d)/g, '"$1":$2');
    // Repair 2: MM:SS timestamps past 60s — "from": 1:6.78  →  "from": 66.78
    const timeFixed = quotFixed.replace(
      /"(from|to)":\s*(\d+):(\d+(?:\.\d+)?)/g,
      (_, key: string, min: string, sec: string) =>
        `"${key}": ${parseInt(min, 10) * 60 + parseFloat(sec)}`,
    );
    // Repair 3: missing "to": key entirely — {"from": 1.2, 3.4, "content":  →  {"from": 1.2, "to": 3.4, "content":
    const repaired = timeFixed.replace(
      /("from":\s*[\d.]+),\s*([\d.]+),\s*("content":)/g,
      '$1, "to": $2, $3',
    );
    // Repair 4: strip Gemini visual bounding-box objects {"box_2d": [...], ...} that sometimes
    // leak into audio transcription responses and produce malformed JSON
    const cleaned = repaired
      .replace(/,\s*\{[^{}]*"box_2d"[^{}]*\}/g, '')
      .replace(/\{[^{}]*"box_2d"[^{}]*\}\s*,/g, '');

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      const pos = Number((e as SyntaxError).message.match(/position (\d+)/)?.[1] ?? 0);
      log.warn({ pos, context: cleaned.slice(Math.max(0, pos - 80), pos + 80) }, 'JSON parse error');
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array found in Gemini response');
      parsed = JSON.parse(match[0]);
    }
    if (!Array.isArray(parsed)) throw new Error('Gemini returned a non-array response');
    const malformed = parsed.filter((s) => typeof s.from !== 'number' || typeof s.to !== 'number' || typeof s.content !== 'string');
    if (malformed.length > 0) {
      log.warn({ malformed: malformed.slice(0, 3) }, 'dropping malformed segments');
    }
    return parsed.filter((s) => typeof s.from === 'number' && typeof s.to === 'number' && typeof s.content === 'string') as Segment[];
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
