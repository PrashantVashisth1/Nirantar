import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import {
  EXTRACTION_JSON_SCHEMA,
  EXTRACTION_PROMPT,
  ExtractionSchema,
  type PrescriptionReader,
  type ReadResult,
} from './extraction';

/**
 * Gemini adapter. Structured JSON output with our schema, a timeout, and one
 * retry for timeouts / provider errors / invalid output. Anything else falls
 * back to the pharmacist's manual entry.
 */
export class GeminiReader implements PrescriptionReader {
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, private readonly model: string = env.GEMINI_MODEL) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async read(image: Buffer, mimeType: string): Promise<ReadResult> {
    let last: ReadResult = { ok: false, error: 'PROVIDER_ERROR' };
    for (let attempt = 1; attempt <= 2; attempt++) {
      last = await this.once(image, mimeType);
      if (last.ok) return last;
      logger.warn({ attempt, error: last.error }, 'Prescription read failed');
    }
    return last;
  }

  private async once(image: Buffer, mimeType: string): Promise<ReadResult> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<ReadResult>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), env.AI_TIMEOUT_MS);
    });
    const call = (async (): Promise<ReadResult> => {
      try {
        const interaction = await this.client.interactions.create({
          model: this.model,
          input: [
            { type: 'text', text: EXTRACTION_PROMPT },
            { type: 'image', data: image.toString('base64'), mime_type: mimeType },
          ],
          response_format: { type: 'text', mime_type: 'application/json', schema: EXTRACTION_JSON_SCHEMA },
        } as never);
        const text = (interaction as { output_text?: string }).output_text ?? '';
        const parsed = ExtractionSchema.safeParse(JSON.parse(text));
        if (!parsed.success) return { ok: false, error: 'INVALID_OUTPUT', detail: parsed.error.message.slice(0, 300) };
        return { ok: true, extraction: parsed.data, model: this.model };
      } catch (error) {
        if (error instanceof SyntaxError) return { ok: false, error: 'INVALID_OUTPUT' };
        return { ok: false, error: 'PROVIDER_ERROR', detail: String((error as Error).message).slice(0, 300) };
      }
    })();
    const result = await Promise.race([call, timeout]);
    clearTimeout(timer);
    return result;
  }
}

class DisabledReader implements PrescriptionReader {
  async read(): Promise<ReadResult> {
    return { ok: false, error: 'DISABLED' };
  }
}

let reader: PrescriptionReader = env.GEMINI_API_KEY ? new GeminiReader(env.GEMINI_API_KEY) : new DisabledReader();

export const getReader = () => reader;
/** Tests swap in a fake provider. */
export const setReader = (next: PrescriptionReader) => {
  reader = next;
};
