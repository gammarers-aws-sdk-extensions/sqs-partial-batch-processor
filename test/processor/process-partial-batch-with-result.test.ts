import type { SQSRecord } from 'aws-lambda';
import { event, sqsRecord } from './sqs-event';
import { processPartialBatchWithResult } from '../../src/processor/process-partial-batch-with-result';

describe('processPartialBatchWithResult', () => {
  it.each([0, -1, -10])('throws RangeError for invalid concurrency (%s)', async (c) => {
    const e = event(sqsRecord('a'));
    await expect(processPartialBatchWithResult(e, async () => ({ ok: true }), { concurrency: c })).rejects.toThrow(RangeError);
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])('throws TypeError for non-integer or non-finite concurrency (%s)', async (c) => {
    const e = event(sqsRecord('a'));
    await expect(processPartialBatchWithResult(e, async () => ({ ok: true }), { concurrency: c })).rejects.toThrow(TypeError);
  });

  it('maps ok: false to failures without throw', async () => {
    const e = event(sqsRecord('a'), sqsRecord('b'));
    const out = await processPartialBatchWithResult(e, async (r) => {
      if (r.messageId === 'b') {
        return { ok: false };
      }
      return { ok: true };
    });
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'b' }]);
  });

  it('invokes onRecordError when processRecord returns { ok: false }', async () => {
    const onRecordError = jest.fn();
    const e = event(sqsRecord('a'), sqsRecord('b'));
    await processPartialBatchWithResult(
      e,
      async (r) => {
        if (r.messageId === 'b') {
          return { ok: false };
        }
        return { ok: true };
      },
      { onRecordError },
    );
    expect(onRecordError).toHaveBeenCalledTimes(1);
    expect(onRecordError.mock.calls[0]?.[0].messageId).toBe('b');
    const err = onRecordError.mock.calls[0]?.[1];
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({
      message: 'processRecord returned { ok: false } (itemIdentifier=b)',
      cause: { itemIdentifier: 'b' },
    });
  });

  it('includes mapMessageId result in onRecordError for { ok: false }', async () => {
    const onRecordError = jest.fn();
    const e = event(sqsRecord('raw-id'));
    await processPartialBatchWithResult(
      e,
      async () => ({ ok: false }),
      {
        onRecordError,
        mapMessageId: (r) => `app:${r.messageId}`,
      },
    );
    expect(onRecordError).toHaveBeenCalledTimes(1);
    const err = onRecordError.mock.calls[0]?.[1];
    expect(err).toMatchObject({
      message: 'processRecord returned { ok: false } (itemIdentifier=app:raw-id)',
      cause: { itemIdentifier: 'app:raw-id' },
    });
  });

  it('aggregates failures with concurrency (order not asserted)', async () => {
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];
    const e = event(...ids.map((id) => sqsRecord(id)));
    const fail = new Set(['r2', 'r4']);
    const out = await processPartialBatchWithResult(
      e,
      async (r) => {
        if (fail.has(r.messageId)) {
          return { ok: false };
        }
        return { ok: true };
      },
      { concurrency: 3 },
    );
    const got = new Set(out.batchItemFailures.map((f) => f.itemIdentifier));
    expect(got).toEqual(fail);
  });

  it('treats thrown errors as failures', async () => {
    const e = event(sqsRecord('z'));
    const out = await processPartialBatchWithResult(e, async () => {
      throw new Error('thrown');
    });
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'z' }]);
  });

  it('invokes onRecordError when processRecord throws', async () => {
    const onRecordError = jest.fn();
    const err = new Error('thrown');
    const e = event(sqsRecord('z'));
    await processPartialBatchWithResult(
      e,
      async () => {
        throw err;
      },
      { onRecordError },
    );
    expect(onRecordError).toHaveBeenCalledTimes(1);
    expect(onRecordError.mock.calls[0]?.[0].messageId).toBe('z');
    expect(onRecordError.mock.calls[0]?.[1]).toBe(err);
  });

  it.each([1, 3])('isolates a throwing mapMessageId (concurrency %s)', async (concurrency) => {
    const onRecordError = jest.fn();
    const mapError = new Error('map failed');
    const seen: string[] = [];
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];
    const e = event(...ids.map((id) => sqsRecord(id)));
    const out = await processPartialBatchWithResult(
      e,
      async (r) => {
        seen.push(r.messageId);
        return { ok: true };
      },
      {
        concurrency,
        onRecordError,
        mapMessageId: (r) => {
          if (r.messageId === 'r2') {
            throw mapError;
          }
          return `app:${r.messageId}`;
        },
      },
    );
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'r2' }]);
    expect(onRecordError).toHaveBeenCalledTimes(1);
    expect(onRecordError.mock.calls[0]?.[0].messageId).toBe('r2');
    expect(onRecordError.mock.calls[0]?.[1]).toBe(mapError);
    expect(new Set(seen)).toEqual(new Set(['r1', 'r3', 'r4', 'r5']));
  });

  it.each([1, 3])('keeps the resolved itemIdentifier when onRecordError throws on a thrown handler (concurrency %s)', async (concurrency) => {
    const onRecordError = jest.fn((_record: SQSRecord, _error: unknown) => {
      throw new Error('hook failed');
    });
    const seen: string[] = [];
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];
    const e = event(...ids.map((id) => sqsRecord(id)));
    const out = await processPartialBatchWithResult(
      e,
      async (r) => {
        seen.push(r.messageId);
        if (r.messageId === 'r4') {
          throw new Error('boom');
        }
        return { ok: true };
      },
      {
        concurrency,
        mapMessageId: (r) => `app:${r.messageId}`,
        onRecordError,
      },
    );
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'app:r4' }]);
    expect(onRecordError).toHaveBeenCalledTimes(1);
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  it.each([1, 3])('reports the resolved itemIdentifier once when onRecordError throws for { ok: false } (concurrency %s)', async (concurrency) => {
    const onRecordError = jest.fn((_record: SQSRecord, _error: unknown) => {
      throw new Error('hook failed');
    });
    const ids = ['r1', 'r2', 'r3'];
    const e = event(...ids.map((id) => sqsRecord(id)));
    const out = await processPartialBatchWithResult(
      e,
      async (r) => {
        if (r.messageId === 'r2') {
          return { ok: false };
        }
        return { ok: true };
      },
      {
        concurrency,
        onRecordError,
        mapMessageId: (r) => `app:${r.messageId}`,
      },
    );
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'app:r2' }]);
    expect(onRecordError).toHaveBeenCalledTimes(1);
    expect(onRecordError.mock.calls[0]?.[1]).toMatchObject({
      message: 'processRecord returned { ok: false } (itemIdentifier=app:r2)',
      cause: { itemIdentifier: 'app:r2' },
    });
  });
});
