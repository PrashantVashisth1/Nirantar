/**
 * What the reader does when the provider misbehaves. No network: the one method
 * that talks to Google is replaced. Found on the first real call: an overloaded
 * model (503) and a refused schema (400) need different handling.
 */
import { describe, expect, it } from 'vitest';
import { EXTRACTION_JSON_SCHEMA } from '../src/services/ai/extraction';
import { GeminiReader } from '../src/services/ai/gemini-reader';

const VALID = JSON.stringify({
  isPrescription: true,
  legibility: 'clear',
  prescriberName: { value: 'Dr. A', confidence: 'high' },
  prescriberRegNo: { value: null, confidence: 'low' },
  prescribedOn: { value: '2026-10-01', confidence: 'high' },
  patientName: { value: 'B', confidence: 'high' },
  items: [],
  unreadableLineCount: 0,
});

class FakeReader extends GeminiReader {
  calls: string[] = [];
  constructor(private readonly answers: (string | Error)[]) {
    super('not-a-real-key', 'primary-model', 'fallback-model', 0);
  }
  protected override async send(model: string): Promise<string> {
    this.calls.push(model);
    const answer = this.answers[this.calls.length - 1]!;
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

const read = (reader: GeminiReader) => reader.read(Buffer.from('x'), 'image/jpeg');

describe('GeminiReader', () => {
  it('uses the primary model when it answers', async () => {
    const reader = new FakeReader([VALID]);
    expect(await read(reader)).toMatchObject({ ok: true, model: 'primary-model' });
    expect(reader.calls).toEqual(['primary-model']);
  });

  it('moves to the second model when the first is overloaded', async () => {
    const reader = new FakeReader([new Error('503 currently experiencing high demand'), VALID]);
    expect(await read(reader)).toMatchObject({ ok: true, model: 'fallback-model' });
    expect(reader.calls).toEqual(['primary-model', 'fallback-model']);
  });

  it('goes back to the first model if the second is overloaded too', async () => {
    const overload = new Error('503 high demand');
    const reader = new FakeReader([overload, overload, VALID]);
    expect(await read(reader)).toMatchObject({ ok: true, model: 'primary-model' });
    expect(reader.calls).toEqual(['primary-model', 'fallback-model', 'primary-model']);
  });

  it('after three bad answers reports failure, so the pharmacist enters it by hand', async () => {
    const reader = new FakeReader(['not json', '{"isPrescription":"maybe"}', '']);
    expect(await read(reader)).toMatchObject({ ok: false, error: 'INVALID_OUTPUT' });
    expect(reader.calls).toHaveLength(3);
  });

  it('does not retry a refused request, which would fail the same way', async () => {
    const reader = new FakeReader([new Error('400 schema has too many states'), VALID]);
    expect(await read(reader)).toMatchObject({ ok: false, error: 'PROVIDER_ERROR' });
    expect(reader.calls).toHaveLength(1);
  });

  it('does not ask a model again once it reports its limit is reached', async () => {
    const reader = new FakeReader([new Error('429 limit: 20 requests per day'), new Error('503 high demand'), VALID]);
    expect(await read(reader)).toMatchObject({ ok: false });
    expect(reader.calls).toEqual(['primary-model', 'fallback-model']);
  });

  it('does retry when told to slow down', async () => {
    const reader = new FakeReader([new Error('429 quota exceeded'), VALID]);
    expect(await read(reader)).toMatchObject({ ok: true });
  });

  it('sends a schema without the array limit Gemini refused as too complex', () => {
    expect(JSON.stringify(EXTRACTION_JSON_SCHEMA)).not.toContain('maxItems');
  });
});
