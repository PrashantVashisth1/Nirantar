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
 * Gemini adapter. Structured JSON output with our schema and a timeout. On a
 * timeout, overload or invalid output it tries a second model, then the first
 * again after short waits: free-tier overload (503) comes and goes, and the first
 * eval lost 5 of 16 reads to it. Three attempts stay inside the 2-minute limit
 * after which a read counts as failed. If all fail, the pharmacist enters the
 * medicines by hand.
 */
export class GeminiReader implements PrescriptionReader {
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly model: string = env.GEMINI_MODEL,
    private readonly fallbackModel: string = env.GEMINI_FALLBACK_MODEL,
    private readonly retryDelayMs: number = 3_000,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async read(image: Buffer, mimeType: string): Promise<ReadResult> {
    let last: ReadResult = { ok: false, error: 'PROVIDER_ERROR' };
    const outOfQuota = new Set<string>();
    for (const [index, model] of [this.model, this.fallbackModel, this.model].entries()) {
      // A model over its limit stays over it, and asking again only uses up more of the day.
      if (outOfQuota.has(model)) continue;
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      last = await this.once(model, image, mimeType);
      if (last.ok) return last;
      logger.warn({ attempt: index + 1, model, error: last.error, detail: last.detail }, 'Prescription read failed');
      // A refused request (bad key, bad schema) fails the same way every time. 429 is only "slow down".
      if (last.error === 'PROVIDER_ERROR' && /^4(?!29)\d\d\b/.test(last.detail ?? '')) break;
      if (/^429\b/.test(last.detail ?? '')) outOfQuota.add(model);
    }
    return last;
  }

  /** One request. Returns the model's text; a test replaces this. */
  protected async send(model: string, image: Buffer, mimeType: string): Promise<string> {
    const interaction = await this.client.interactions.create(
      {
        model,
        input: [
          { type: 'text', text: EXTRACTION_PROMPT },
          { type: 'image', data: image.toString('base64'), mime_type: mimeType },
        ],
        response_format: { type: 'text', mime_type: 'application/json', schema: EXTRACTION_JSON_SCHEMA },
      } as never,
      // Our own retry decides what happens next; the SDK's would hide a 503 until our timeout.
      { maxRetries: 0, timeout: env.AI_TIMEOUT_MS },
    );
    return (interaction as { output_text?: string }).output_text ?? '';
  }

  private async once(model: string, image: Buffer, mimeType: string): Promise<ReadResult> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<ReadResult>((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, error: 'TIMEOUT' }), env.AI_TIMEOUT_MS);
    });
    const call = (async (): Promise<ReadResult> => {
      try {
        const text = await this.send(model, image, mimeType);
        const parsed = ExtractionSchema.safeParse(JSON.parse(text));
        if (!parsed.success) return { ok: false, error: 'INVALID_OUTPUT', detail: parsed.error.message.slice(0, 300) };
        return { ok: true, extraction: parsed.data, model };
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
