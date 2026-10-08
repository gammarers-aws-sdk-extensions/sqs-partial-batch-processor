import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import { runAtConcurrency } from './core/concurrency';
import { reportRecordFailure } from './core/report-record-failure';
import type { ProcessPartialBatchOptions, ProcessRecordResult } from './core/types';

/**
 * Like {@link processPartialBatch}, but uses a Result-style callback (no throw for control flow).
 *
 * - `{ ok: true }`: success (not listed in `batchItemFailures`)
 * - `{ ok: false }`: failure; if `onRecordError` is set, it receives an `Error` whose
 *   message includes the resolved `itemIdentifier`, and whose `cause` is `{ itemIdentifier }`
 * - thrown errors: still treated as failures; `onRecordError` receives the thrown value when set
 *
 * Throws from `processRecord`, `mapMessageId`, and `onRecordError` stay inside
 * the record that raised them. The returned promise still resolves. When
 * `mapMessageId` throws, that record is reported with `record.messageId`.
 *
 * @param event The SQS Lambda event.
 * @param processRecord Per-record handler returning `{ ok: true }` or `{ ok: false }`.
 * @param options Optional concurrency, error hook, and message id mapping.
 * @returns An {@link SQSBatchResponse} listing only failed `itemIdentifier`s.
 * @throws {@link SqsPartialBatchProcessorRangeError} When `options.concurrency` is less than 1.
 * @throws {@link SqsPartialBatchProcessorTypeError} When `options.concurrency` is not a finite integer.
 */
export const processPartialBatchWithResult = async (
  event: SQSEvent,
  processRecord: (record: SQSRecord) => Promise<ProcessRecordResult>,
  options?: ProcessPartialBatchOptions,
): Promise<SQSBatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  /**
   * Processes one record; maps throws and `{ ok: false }` to batch item failures.
   * Identifier resolution and the error hook stay inside this boundary.
   *
   * @param record The SQS record to process.
   */
  const handle = async (record: SQSRecord): Promise<void> => {
    let id = record.messageId;

    try {
      id = options?.mapMessageId?.(record) ?? record.messageId;
      const result = await processRecord(record);
      if (result.ok) {
        return;
      }

      const error = new Error(`processRecord returned { ok: false } (itemIdentifier=${id})`);
      Object.assign(error, { cause: { itemIdentifier: id } });
      reportRecordFailure(batchItemFailures, record, id, error, options?.onRecordError);
    } catch (error) {
      reportRecordFailure(batchItemFailures, record, id, error, options?.onRecordError);
    }
  };

  await runAtConcurrency(event.Records, options?.concurrency, handle);
  return { batchItemFailures };
};
