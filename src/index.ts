import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';

/**
 * Options for {@link processPartialBatch} and {@link processPartialBatchWithResult}.
 */
export interface ProcessPartialBatchOptions {
  /**
   * Maximum number of records processed in parallel.
   *
   * - `1`: sequential processing
   * - `> 1`: bounded concurrency pool (order of {@link SQSBatchResponse.batchItemFailures} is not guaranteed)
   *
   * @default 1
   * @throws {RangeError} When `concurrency` is less than 1.
   * @throws {TypeError} When `concurrency` is not a finite integer.
   */
  readonly concurrency?: number;

  /**
   * Called when a record is treated as failed (thrown error or `{ ok: false }`).
   * Use for logging or metrics; the library does not write to `console` by default.
   *
   * For `{ ok: false }` from {@link processPartialBatchWithResult}, `error` is an `Error`
   * whose message includes the resolved `itemIdentifier`, and whose `cause` is
   * `{ itemIdentifier }` for structured logging.
   *
   * Do not log `record.body` as-is — it may contain secrets or personal data.
   * Prefer identifiers such as `record.messageId` (or your `mapMessageId` result)
   * and a sanitized error summary.
   *
   * @param record The failed SQS record.
   * @param error The thrown value, or a synthesized `Error` when `{ ok: false }` was returned.
   */
  readonly onRecordError?: (record: SQSRecord, error: unknown) => void;

  /**
   * Returns the `itemIdentifier` reported in `batchItemFailures` for a record.
   * Defaults to `record.messageId` when omitted.
   *
   * @param record The SQS record being processed.
   * @returns The identifier sent back to Lambda in `batchItemFailures`.
   */
  readonly mapMessageId?: (record: SQSRecord) => string;
}

/**
 * Creates a single `batchItemFailures` entry for a failed record.
 *
 * @param itemIdentifier The identifier reported back to Lambda.
 * @returns An object suitable for {@link SQSBatchResponse.batchItemFailures}.
 */
const itemFailure = (itemIdentifier: string): { itemIdentifier: string } => ({
  itemIdentifier,
});

/**
 * Resolves and validates the `concurrency` option.
 *
 * @param value User-provided concurrency.
 * @returns A validated concurrency value (defaults to `1`).
 * @throws {RangeError} When `value` is less than 1.
 * @throws {TypeError} When `value` is not a finite integer.
 */
const resolveConcurrency = (value: number | undefined): number => {
  if (value === undefined) {
    return 1;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError('concurrency must be a finite integer');
  }
  if (value < 1) {
    throw new RangeError('concurrency must be >= 1');
  }
  return value;
};

/**
 * Runs `fn` over `items` with at most `concurrency` parallel workers.
 * Each worker pulls the next index until none remain.
 *
 * @param items Items to process.
 * @param concurrency Maximum parallel workers (must be `>= 1`).
 * @param fn Async handler invoked for each item.
 * @returns A promise that resolves when every item has been processed.
 */
const runWithConcurrency = async <T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> => {
  if (items.length === 0) {
    return;
  }
  const limit = Math.min(concurrency, items.length);
  let next = 0;

  /**
   * Claims the next work index, or `undefined` when the queue is empty.
   *
   * @returns The next index to process, or `undefined` if none remain.
   */
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
 *
 * @param event The SQS Lambda event.
 * @param processRecord Per-record handler. Throw to mark only that record as failed.
 * @param options Optional concurrency, error hook, and message id mapping.
 * @returns An {@link SQSBatchResponse} listing only failed `itemIdentifier`s.
 * @throws {RangeError} When `options.concurrency` is less than 1.
 * @throws {TypeError} When `options.concurrency` is not a finite integer.
 */
export const processPartialBatch = async (
  event: SQSEvent,
  processRecord: (record: SQSRecord) => Promise<void>,
  options?: ProcessPartialBatchOptions,
): Promise<SQSBatchResponse> => {
  const concurrency = resolveConcurrency(options?.concurrency);
  const batchItemFailures: { itemIdentifier: string }[] = [];

  /**
   * Processes one record and records a batch item failure on error.
   *
   * @param record The SQS record to process.
   */
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
 *
 * - `{ ok: true }`: success (not listed in `batchItemFailures`)
 * - `{ ok: false }`: failure; if `onRecordError` is set, it receives an `Error` whose
 *   message includes the resolved `itemIdentifier`, and whose `cause` is `{ itemIdentifier }`
 * - thrown errors: still treated as failures; `onRecordError` receives the thrown value when set
 *
 * @param event The SQS Lambda event.
 * @param processRecord Per-record handler returning `{ ok: true }` or `{ ok: false }`.
 * @param options Optional concurrency, error hook, and message id mapping.
 * @returns An {@link SQSBatchResponse} listing only failed `itemIdentifier`s.
 * @throws {RangeError} When `options.concurrency` is less than 1.
 * @throws {TypeError} When `options.concurrency` is not a finite integer.
 */
export const processPartialBatchWithResult = async (
  event: SQSEvent,
  processRecord: (record: SQSRecord) => Promise<{ ok: true } | { ok: false }>,
  options?: ProcessPartialBatchOptions,
): Promise<SQSBatchResponse> => {
  const concurrency = resolveConcurrency(options?.concurrency);
  const batchItemFailures: { itemIdentifier: string }[] = [];

  /**
   * Processes one record; maps throws and `{ ok: false }` to batch item failures.
   *
   * @param record The SQS record to process.
   */
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
      const error = new Error(`processRecord returned { ok: false } (itemIdentifier=${id})`);
      Object.assign(error, { cause: { itemIdentifier: id } });
      options.onRecordError(record, error);
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
