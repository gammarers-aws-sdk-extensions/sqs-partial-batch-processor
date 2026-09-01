import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import type { ProcessPartialBatchOptions, ProcessRecordResult } from '../types';
import { resolveConcurrency, runWithConcurrency } from './concurrency';
import { itemFailure } from './item-failure';

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
  processRecord: (record: SQSRecord) => Promise<ProcessRecordResult>,
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
    let result: ProcessRecordResult;
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
