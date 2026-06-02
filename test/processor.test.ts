import type { SQSEvent, SQSRecord } from 'aws-lambda';
import {
  processPartialBatch,
  processPartialBatchWithResult,
} from '../src/index';

function sqsRecord(messageId: string, body = '{}'): SQSRecord {
  return {
    messageId,
    receiptHandle: `rh-${messageId}`,
    body,
    attributes: {
      ApproximateReceiveCount: '1',
      SentTimestamp: '0',
      SenderId: 'sender',
      ApproximateFirstReceiveTimestamp: '0',
    },
    messageAttributes: {},
    md5OfBody: 'md5',
    eventSource: 'aws:sqs',
    eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:q',
    awsRegion: 'us-east-1',
  };
}

function event(...records: SQSRecord[]): SQSEvent {
  return { Records: records };
}

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
});

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
    expect(onRecordError.mock.calls[0]?.[1]).toBeInstanceOf(Error);
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
});
