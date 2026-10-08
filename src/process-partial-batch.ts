import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import { runAtConcurrency } from './core/concurrency';
import { reportRecordFailure } from './core/report-record-failure';
import type { ProcessPartialBatchOptions } from './core/types';

/**
 * Runs `processRecord` for each SQS record. Thrown errors are mapped to
 * `batchItemFailures`; successful records are not listed.
 *
 * Throws from `processRecord`, `mapMessageId`, and `onRecordError` stay inside
 * the record that raised them. The returned promise still resolves. When
 * `mapMessageId` throws, that record is reported with `record.messageId`.
 *
 * @param event The SQS Lambda event.
 * @param processRecord Per-record handler. Throw to mark only that record as failed.
 * @param options Optional concurrency, error hook, and message id mapping.
 * @returns An {@link SQSBatchResponse} listing only failed `itemIdentifier`s.
 * @throws {@link SqsPartialBatchProcessorRangeError} When `options.concurrency` is less than 1.
 * @throws {@link SqsPartialBatchProcessorTypeError} When `options.concurrency` is not a finite integer.
 */
export const processPartialBatch = async (
  event: SQSEvent,
  processRecord: (record: SQSRecord) => Promise<void>,
  options?: ProcessPartialBatchOptions,
): Promise<SQSBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  /**
   * Processes one record and records a batch item failure on error.
   * Identifier resolution and the error hook stay inside this boundary.
   *
   * @param record The SQS record to process.
   */
  const handle = async (record: SQSRecord): Promise<void> => {
    let id = record.messageId;

    try {
      id = options?.mapMessageId?.(record) ?? record.messageId;
      await processRecord(record);
    } catch (error) {
      reportRecordFailure(batchItemFailures, record, id, error, options?.onRecordError);
    }
  };

  await runAtConcurrency(event.Records, options?.concurrency, handle);
  return { batchItemFailures };
};
