import type { SQSRecord } from 'aws-lambda';
import {
  processPartialBatch,
  SqsPartialBatchProcessorError,
  SqsPartialBatchProcessorRangeError,
  SqsPartialBatchProcessorTimeoutError,
  SqsPartialBatchProcessorTypeError,
} from '../src';
import { event, sqsRecord } from './sqs-event';

const hang = (): Promise<void> => new Promise(() => {});

/**
 * Builds a record with a FIFO group id.
 *
 * @param messageId SQS message id.
 * @param messageGroupId FIFO group id.
 * @returns A stub {@link SQSRecord}.
 */
const grouped = (messageId: string, messageGroupId: string): SQSRecord => {
  const record = sqsRecord(messageId);
  return {
    ...record,
    attributes: {
      ...record.attributes,
      MessageGroupId: messageGroupId,
    },
  };
};

describe('recordTimeoutMs', () => {
  it.each([0, -1, -10])('throws SqsPartialBatchProcessorRangeError for recordTimeoutMs %s', async (recordTimeoutMs) => {
    const fn = jest.fn(async () => {});
    const caught = await processPartialBatch(event(sqsRecord('a')), fn, { recordTimeoutMs }).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(SqsPartialBatchProcessorRangeError);
    expect(caught).toBeInstanceOf(SqsPartialBatchProcessorError);
    expect(fn).not.toHaveBeenCalled();
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])('throws SqsPartialBatchProcessorTypeError for recordTimeoutMs %s', async (recordTimeoutMs) => {
    const fn = jest.fn(async () => {});
    const caught = await processPartialBatch(event(sqsRecord('a')), fn, { recordTimeoutMs }).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(SqsPartialBatchProcessorTypeError);
    expect(caught).toBeInstanceOf(SqsPartialBatchProcessorError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns before the limit when the handler settles', async () => {
    const startedAt = Date.now();
    const out = await processPartialBatch(event(sqsRecord('a'), sqsRecord('b')), async () => {}, {
      recordTimeoutMs: 2000,
    });
    expect(out.batchItemFailures).toEqual([]);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it.each([1, 3])('fails only the record that exceeds recordTimeoutMs (concurrency %s)', async (concurrency) => {
    const seen: string[] = [];
    const out = await processPartialBatch(
      event(sqsRecord('hang'), sqsRecord('ok')),
      async (record) => {
        seen.push(record.messageId);
        if (record.messageId === 'hang') {
          await hang();
        }
      },
      { concurrency, recordTimeoutMs: 30 },
    );
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'hang' }]);
    expect(new Set(seen)).toEqual(new Set(['hang', 'ok']));
  });

  it('reports SqsPartialBatchProcessorTimeoutError from onRecordError', async () => {
    const onRecordError = jest.fn();
    const out = await processPartialBatch(
      event(sqsRecord('hang')),
      async () => {
        await hang();
      },
      {
        recordTimeoutMs: 30,
        onRecordError,
        mapMessageId: (record) => `app:${record.messageId}`,
      },
    );
    const reported = onRecordError.mock.calls[0]?.[1];
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'app:hang' }]);
    expect(onRecordError).toHaveBeenCalledTimes(1);
    expect(reported).toBeInstanceOf(SqsPartialBatchProcessorTimeoutError);
    expect(reported).toBeInstanceOf(SqsPartialBatchProcessorError);
    expect(reported).toMatchObject({
      message: expect.stringContaining('Record hang exceeded recordTimeoutMs 30'),
    });
  });

  it('keeps a handler error when the record finishes inside the limit', async () => {
    const onRecordError = jest.fn();
    const boom = new Error('boom');
    const out = await processPartialBatch(
      event(sqsRecord('bad'), sqsRecord('ok')),
      async (record) => {
        if (record.messageId === 'bad') {
          throw boom;
        }
      },
      { recordTimeoutMs: 2000, onRecordError },
    );
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'bad' }]);
    expect(onRecordError).toHaveBeenCalledTimes(1);
    expect(onRecordError.mock.calls[0]?.[1]).toBe(boom);
  });

  it('keeps a timeout inside the record when onRecordError throws', async () => {
    const seen: string[] = [];
    const out = await processPartialBatch(
      event(sqsRecord('hang'), sqsRecord('ok')),
      async (record) => {
        seen.push(record.messageId);
        if (record.messageId === 'hang') {
          await hang();
        }
      },
      {
        recordTimeoutMs: 30,
        onRecordError: () => {
          throw new Error('hook failed');
        },
      },
    );
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'hang' }]);
    expect(new Set(seen)).toEqual(new Set(['hang', 'ok']));
  });

  it.each([1, 3])('stops the message group when a record times out (concurrency %s)', async (concurrency) => {
    const seen: string[] = [];
    const out = await processPartialBatch(
      event(grouped('a1', 'A'), grouped('a2', 'A'), grouped('b1', 'B')),
      async (record) => {
        seen.push(record.messageId);
        if (record.messageId === 'a1') {
          await hang();
        }
      },
      { concurrency, recordTimeoutMs: 30 },
    );
    const failed = out.batchItemFailures.map((failure) => failure.itemIdentifier);
    expect(new Set(failed)).toEqual(new Set(['a1', 'a2']));
    expect(failed).toHaveLength(2);
    expect(seen).toContain('b1');
    expect(seen).not.toContain('a2');
  });
});
