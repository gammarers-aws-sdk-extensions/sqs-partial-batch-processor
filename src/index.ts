import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';

/**
 * Options for {@link processPartialBatch} and {@link processPartialBatchWithResult}.
 */
export interface ProcessPartialBatchOptions {
  /**
   * When greater than 1, records are processed with a bounded concurrency pool.
   * Order of entries in {@link SQSBatchResponse.batchItemFailures} is not guaranteed.
   * @default 1
   */
  readonly concurrency?: number;

  /**
   * Called when a record is treated as failed (thrown error or `{ ok: false }`).
   * Use for logging; the library does not write to `console` by default.
   */
  readonly onRecordError?: (record: SQSRecord, error: unknown) => void;

  /**
   * Returns the value for `itemIdentifier` for a record. Defaults to `record.messageId`.
   */
  readonly mapMessageId?: (record: SQSRecord) => string;
}

const itemFailure = (itemIdentifier: string): { itemIdentifier: string } => ({
  itemIdentifier,
});

/**
 * Runs `fn` over `items` with at most `concurrency` parallel workers.
 * Each worker pulls the next index until none remain.
 */
const runWithConcurrency = async <T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> => {
  if (items.length === 0) {
    return;
  }
  const limit = Math.min(Math.max(1, concurrency), items.length);
  let next = 0;

  const takeNextIndex = (): number | undefined => {
    const index = next;
    next += 1;
    if (index >= items.length) {
      return undefined;
    }
    return index;
  };

  const workers: Promise<void>[] = [];
  for (let w = 0; w < limit; w++) {
    workers.push((async () => {
      let workIndex = takeNextIndex();
      while (workIndex !== undefined) {
        const item = items[workIndex];
        if (item === undefined) {
          return;
        }
        await fn(item);
        workIndex = takeNextIndex();
      }
    })());
  }
  await Promise.all(workers);
};

/**
 * Runs `processRecord` for each SQS record. Thrown errors are mapped to
 * `batchItemFailures`; successful records are not listed.
 */
export const processPartialBatch = async (
  event: SQSEvent,
  processRecord: (record: SQSRecord) => Promise<void>,
  options?: ProcessPartialBatchOptions,
): Promise<SQSBatchResponse> => {
  const concurrency = options?.concurrency ?? 1;
  const batchItemFailures: { itemIdentifier: string }[] = [];

  const handle = async (record: SQSRecord): Promise<void> => {
    const id = options?.mapMessageId?.(record) ?? record.messageId;
    try {
      await processRecord(record);
    } catch (error) {
      if (options?.onRecordError) {
        options.onRecordError(record, error);
      }
      batchItemFailures.push(itemFailure(id));
    }
  };

  if (concurrency <= 1) {
    for (const record of event.Records) {
      await handle(record);
    }
  } else {
    await runWithConcurrency(event.Records, concurrency, handle);
  }

  return { batchItemFailures };
};

/**
 * Like {@link processPartialBatch}, but uses a Result-style callback (no throw for control flow).
 * If `processRecord` throws, the record is still treated as failed and `onRecordError` is invoked when set.
 */
export const processPartialBatchWithResult = async (
  event: SQSEvent,
  processRecord: (record: SQSRecord) => Promise<{ ok: true } | { ok: false }>,
  options?: ProcessPartialBatchOptions,
): Promise<SQSBatchResponse> => {
  const concurrency = options?.concurrency ?? 1;
  const batchItemFailures: { itemIdentifier: string }[] = [];

  const handle = async (record: SQSRecord): Promise<void> => {
    const id = options?.mapMessageId?.(record) ?? record.messageId;
    let result: { ok: true } | { ok: false };
    try {
      result = await processRecord(record);
    } catch (error) {
      if (options?.onRecordError) {
        options.onRecordError(record, error);
      }
      batchItemFailures.push(itemFailure(id));
      return;
    }
    if (result.ok) {
      return;
    }
    if (options?.onRecordError) {
      options.onRecordError(record, new Error('processRecord returned { ok: false }'));
    }
    batchItemFailures.push(itemFailure(id));
  };

  if (concurrency <= 1) {
    for (const record of event.Records) {
      await handle(record);
    }
  } else {
    await runWithConcurrency(event.Records, concurrency, handle);
  }

  return { batchItemFailures };
};
