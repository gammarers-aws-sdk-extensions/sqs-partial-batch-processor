import type { SQSRecord } from 'aws-lambda';
import { event, sqsRecord } from './sqs-event';
import { processPartialBatch } from '../../src/processor/process-partial-batch';

describe('processPartialBatch', () => {
  it.each([0, -1, -10])('throws RangeError for invalid concurrency (%s)', async (c) => {
    const e = event(sqsRecord('a'));
    await expect(processPartialBatch(e, async () => {}, { concurrency: c })).rejects.toThrow(RangeError);
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])('throws TypeError for non-integer or non-finite concurrency (%s)', async (c) => {
    const e = event(sqsRecord('a'));
    await expect(processPartialBatch(e, async () => {}, { concurrency: c })).rejects.toThrow(TypeError);
  });

  it('returns empty batchItemFailures when all records succeed', async () => {
    const e = event(sqsRecord('a'), sqsRecord('b'));
    const fn = jest.fn(async () => {});
    const out = await processPartialBatch(e, fn);
    expect(out.batchItemFailures).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('maps thrown errors to messageId in batchItemFailures', async () => {
    const e = event(sqsRecord('ok1'), sqsRecord('fail'), sqsRecord('ok2'));
    const out = await processPartialBatch(e, async (r) => {
      if (r.messageId === 'fail') {
        throw new Error('boom');
      }
    });
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'fail' }]);
  });

  it('includes all messageIds when every record throws', async () => {
    const e = event(sqsRecord('x'), sqsRecord('y'));
    const out = await processPartialBatch(e, async () => {
      throw new Error('x');
    });
    expect(new Set(out.batchItemFailures.map((f) => f.itemIdentifier))).toEqual(new Set(['x', 'y']));
  });

  it('aggregates failures with concurrency (order not asserted)', async () => {
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];
    const e = event(...ids.map((id) => sqsRecord(id)));
    const fail = new Set(['r2', 'r4']);
    const out = await processPartialBatch(
      e,
      async (r) => {
        if (fail.has(r.messageId)) {
          throw new Error('fail');
        }
      },
      { concurrency: 3 },
    );
    const got = new Set(out.batchItemFailures.map((f) => f.itemIdentifier));
    expect(got).toEqual(fail);
  });

  it('invokes onRecordError on failure', async () => {
    const onRecordError = jest.fn();
    const err = new Error('e');
    const e = event(sqsRecord('only'));
    await processPartialBatch(
      e,
      async () => {
        throw err;
      },
      { onRecordError },
    );
    expect(onRecordError).toHaveBeenCalledTimes(1);
    expect(onRecordError.mock.calls[0]?.[0].messageId).toBe('only');
    expect(onRecordError.mock.calls[0]?.[1]).toBe(err);
  });

  it('uses mapMessageId for itemIdentifier', async () => {
    const e = event(sqsRecord('mid'));
    const out = await processPartialBatch(
      e,
      async () => {
        throw new Error('x');
      },
      { mapMessageId: () => 'custom-id' },
    );
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'custom-id' }]);
  });

  it.each([1, 3])('isolates a throwing mapMessageId (concurrency %s)', async (concurrency) => {
    const onRecordError = jest.fn();
    const mapError = new Error('map failed');
    const seen: string[] = [];
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];
    const e = event(...ids.map((id) => sqsRecord(id)));
    const out = await processPartialBatch(
      e,
      async (r) => {
        seen.push(r.messageId);
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

  it.each([1, 3])('keeps the resolved itemIdentifier when onRecordError throws (concurrency %s)', async (concurrency) => {
    const seen: string[] = [];
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];
    const e = event(...ids.map((id) => sqsRecord(id)));
    const out = await processPartialBatch(
      e,
      async (r) => {
        seen.push(r.messageId);
        if (r.messageId === 'r4') {
          throw new Error('boom');
        }
      },
      {
        concurrency,
        mapMessageId: (r) => `app:${r.messageId}`,
        onRecordError: () => {
          throw new Error('hook failed');
        },
      },
    );
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'app:r4' }]);
    expect(new Set(seen)).toEqual(new Set(ids));
  });

  it.each([1, 3])('reports messageId once when mapMessageId and onRecordError both throw (concurrency %s)', async (concurrency) => {
    const onRecordError = jest.fn((_record: SQSRecord, _error: unknown) => {
      throw new Error('hook failed');
    });
    const ids = ['r1', 'r2', 'r3'];
    const seen: string[] = [];
    const e = event(...ids.map((id) => sqsRecord(id)));
    const out = await processPartialBatch(
      e,
      async (r) => {
        seen.push(r.messageId);
      },
      {
        concurrency,
        onRecordError,
        mapMessageId: (r) => {
          if (r.messageId === 'r2') {
            throw new Error('map failed');
          }
          return `app:${r.messageId}`;
        },
      },
    );
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'r2' }]);
    expect(onRecordError).toHaveBeenCalledTimes(1);
    expect(onRecordError.mock.calls[0]?.[1]).toMatchObject({ message: 'map failed' });
    expect(new Set(seen)).toEqual(new Set(['r1', 'r3']));
  });
});
