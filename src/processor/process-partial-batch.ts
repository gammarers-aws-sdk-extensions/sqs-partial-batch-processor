import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import type { ProcessPartialBatchOptions } from '../types';
import { resolveConcurrency, runWithConcurrency } from './concurrency';
import { itemFailure } from './item-failure';

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
