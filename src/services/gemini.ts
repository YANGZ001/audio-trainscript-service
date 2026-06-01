import { GoogleGenAI } from '@google/genai';

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
  'Example: [{"from":0,"to":4,"content":"Hello."},{"from":4,"to":8,"content":"Next sentence."}]';

export async function transcribeAudio(
  filePath: string,
  onTranscribing: () => void,
): Promise<Segment[]> {
  const ai = createClient();
  let uploadedName: string | undefined;

  try {
    const uploaded = await ai.files.upload({
      file: filePath,
      config: { mimeType: 'audio/mp4' },
    });
    uploadedName = uploaded.name;

    // Wait for Gemini to finish processing the uploaded file (max ~5 min)
    let fileInfo = uploaded;
    let pollAttempts = 0;
    const POLL_LIMIT = 100;
    while (fileInfo.state === 'PROCESSING') {
      if (++pollAttempts > POLL_LIMIT) {
        throw new Error('Gemini file processing timed out');
      }
      await new Promise((r) => setTimeout(r, 3000));
      fileInfo = await ai.files.get({ name: uploadedName! });
    }
    if (fileInfo.state === 'FAILED') {
      throw new Error('Gemini file processing failed');
    }
    if (!fileInfo.uri) {
      throw new Error('Gemini file URI missing after upload');
    }

    onTranscribing();

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
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
    console.log('[gemini] raw response (first 500 chars):', raw.slice(0, 500));
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(repaired);
    } catch (e) {
      const pos = Number((e as SyntaxError).message.match(/position (\d+)/)?.[1] ?? 0);
      console.log('[gemini] parse error at pos', pos, '— context:', JSON.stringify(repaired.slice(Math.max(0, pos - 80), pos + 80)));
      const match = repaired.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array found in Gemini response');
      parsed = JSON.parse(match[0]);
    }
    if (!Array.isArray(parsed)) throw new Error('Gemini returned a non-array response');
    const malformed = parsed.filter((s) => typeof s.from !== 'number' || typeof s.to !== 'number' || typeof s.content !== 'string');
    if (malformed.length > 0) {
      console.log('[gemini] dropping malformed segments:', JSON.stringify(malformed.slice(0, 3)));
    }
    return parsed.filter((s) => typeof s.from === 'number' && typeof s.to === 'number' && typeof s.content === 'string') as Segment[];
  } finally {
    if (uploadedName) {
      await ai.files.delete({ name: uploadedName }).catch(() => {});
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
    console.error('Gemini orphaned file cleanup error:', err);
  }
}
