import type { SQSRecord } from 'aws-lambda';
import { processPartialBatch } from '../src';
import { event, sqsRecord } from './sqs-event';

/**
 * Builds a record with an optional FIFO group id.
 *
 * @param messageId SQS message id.
 * @param messageGroupId Group id. Omit it to leave the attribute unset. An empty string is stored as-is.
 * @returns A stub {@link SQSRecord}.
 */
const grouped = (messageId: string, messageGroupId?: string): SQSRecord => {
  const record = sqsRecord(messageId);

  if (messageGroupId === undefined) {
    return record;
  }

  return {
    ...record,
    attributes: {
      ...record.attributes,
      MessageGroupId: messageGroupId,
    },
  };
};

const gate = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

describe('FIFO message groups', () => {
  it.each([1, 3])('reports the failed record and later records in that group (concurrency %s)', async (concurrency) => {
    const seen: string[] = [];
    const out = await processPartialBatch(
      event(
        grouped('a1', 'A'),
        grouped('b1', 'B'),
        grouped('a2', 'A'),
        grouped('b2', 'B'),
        grouped('a3', 'A'),
      ),
      async (record) => {
        seen.push(record.messageId);
        if (record.messageId === 'a2') {
          throw new Error('boom');
        }
      },
      { concurrency },
    );
    const failed = out.batchItemFailures.map((failure) => failure.itemIdentifier);

    expect(new Set(failed)).toEqual(new Set(['a2', 'a3']));
    expect(failed).toHaveLength(2);
    expect(new Set(seen)).toEqual(new Set(['a1', 'b1', 'a2', 'b2']));

    if (concurrency === 1) {
      expect(seen).toEqual(['a1', 'b1', 'a2', 'b2']);
      expect(failed).toEqual(['a2', 'a3']);
    }
  });

  it.each([1, 3])('stops the group on the first throw (concurrency %s)', async (concurrency) => {
    const seen: string[] = [];
    const out = await processPartialBatch(
      event(grouped('a1', 'A'), grouped('a2', 'A'), grouped('a3', 'A')),
      async (record) => {
        seen.push(record.messageId);
        throw new Error('boom');
      },
      { concurrency },
    );

    expect(seen).toEqual(['a1']);
    expect(out.batchItemFailures.map((failure) => failure.itemIdentifier)).toEqual(['a1', 'a2', 'a3']);
  });

  it.each([1, 3])('uses mapMessageId for a skipped group tail (concurrency %s)', async (concurrency) => {
    const onRecordError = jest.fn();
    const seen: string[] = [];
    const out = await processPartialBatch(
      event(grouped('a1', 'A'), grouped('a2', 'A'), grouped('b1', 'B')),
      async (record) => {
        seen.push(record.messageId);
        if (record.messageId === 'a1') {
          throw new Error('boom');
        }
      },
      {
        concurrency,
        onRecordError,
        mapMessageId: (record) => `app:${record.messageId}`,
      },
    );

    expect(out.batchItemFailures.map((failure) => failure.itemIdentifier)).toEqual(['app:a1', 'app:a2']);
    expect(seen).toEqual(['a1', 'b1']);
    expect(onRecordError).toHaveBeenCalledTimes(1);
    expect(onRecordError.mock.calls[0]?.[0].messageId).toBe('a1');
  });

  it.each([1, 3])('keeps a skipped tail inside the record boundary when mapMessageId throws (concurrency %s)', async (concurrency) => {
    const onRecordError = jest.fn();
    const seen: string[] = [];
    const out = await processPartialBatch(
      event(grouped('a1', 'A'), grouped('a2', 'A'), grouped('b1', 'B')),
      async (record) => {
        seen.push(record.messageId);
        if (record.messageId === 'a1') {
          throw new Error('handler failed');
        }
      },
      {
        concurrency,
        onRecordError,
        mapMessageId: (record) => {
          if (record.messageId === 'a2') {
            throw new Error('map failed');
          }
          return `app:${record.messageId}`;
        },
      },
    );

    expect(out.batchItemFailures.map((failure) => failure.itemIdentifier)).toEqual(['app:a1', 'a2']);
    expect(seen).toEqual(['a1', 'b1']);
    expect(onRecordError).toHaveBeenCalledTimes(2);
    expect(onRecordError.mock.calls[0]?.[1]).toMatchObject({ message: 'handler failed' });
    expect(onRecordError.mock.calls[1]?.[0].messageId).toBe('a2');
    expect(onRecordError.mock.calls[1]?.[1]).toMatchObject({ message: 'map failed' });
  });

  it.each([1, 3])('treats a missing or empty group id as independent (concurrency %s)', async (concurrency) => {
    const seen: string[] = [];
    const out = await processPartialBatch(
      event(grouped('a'), grouped('b', ''), grouped('c')),
      async (record) => {
        seen.push(record.messageId);
        if (record.messageId === 'b') {
          throw new Error('boom');
        }
      },
      { concurrency },
    );

    expect(new Set(seen)).toEqual(new Set(['a', 'b', 'c']));
    expect(out.batchItemFailures).toEqual([{ itemIdentifier: 'b' }]);
  });

  it('does not start a later group record while an earlier one is in flight', async () => {
    const release = gate();
    const a1Started = gate();
    let startedTail = false;
    const seen: string[] = [];
    const pending = processPartialBatch(
      event(grouped('a1', 'A'), grouped('a2', 'A'), grouped('b1', 'B')),
      async (record) => {
        seen.push(record.messageId);
        if (record.messageId === 'a1') {
          a1Started.resolve();
          await release.promise;
          throw new Error('boom');
        }
        if (record.messageId === 'a2') {
          startedTail = true;
        }
      },
      { concurrency: 3 },
    );

    await a1Started.promise;
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(startedTail).toBe(false);
    expect(seen).toContain('b1');
    expect(seen).not.toContain('a2');
    release.resolve();

    const out = await pending;
    expect(startedTail).toBe(false);
    expect(seen).not.toContain('a2');
    expect(new Set(out.batchItemFailures.map((failure) => failure.itemIdentifier))).toEqual(new Set(['a1', 'a2']));
  });
});
