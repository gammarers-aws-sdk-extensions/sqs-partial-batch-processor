import type { SQSRecord } from 'aws-lambda';

/**
 * Options for {@link processPartialBatch}.
 */
export interface ProcessPartialBatchOptions {
  /**
   * Maximum number of records processed in parallel.
   *
   * - `1`: sequential processing
   * - `> 1`: bounded concurrency pool (order of {@link SQSBatchResponse.batchItemFailures} is not guaranteed)
   *
   * @default 1
   * @throws {@link SqsPartialBatchProcessorRangeError} When `concurrency` is less than 1.
   * @throws {@link SqsPartialBatchProcessorTypeError} When `concurrency` is not a finite integer.
   */
  readonly concurrency?: number;

  /**
   * Called when a record handler throws.
   * Use for logging or metrics; the library does not write to `console` by default.
   *
   * Do not log `record.body` as-is — it may contain secrets or personal data.
   * Prefer identifiers such as `record.messageId` (or your `mapMessageId` result)
   * and a sanitized error summary.
   *
   * A throw from this hook does not reject the processor. The record is still
   * listed in `batchItemFailures` with the identifier already resolved for it.
   * When `mapMessageId` throws, `error` is that thrown value and the identifier
   * falls back to `record.messageId`.
   *
   * @param record The failed SQS record.
   * @param error The value thrown by the record handler or by `mapMessageId`.
   */
  readonly onRecordError?: (record: SQSRecord, error: unknown) => void;

  /**
   * Returns the `itemIdentifier` reported in `batchItemFailures` for a record.
   * Defaults to `record.messageId` when omitted.
   *
   * When this function throws, that record is reported with `record.messageId`
   * and the remaining records are still processed. The thrown value is passed
   * to `onRecordError` when the hook is set.
   *
   * @param record The SQS record being processed.
   * @returns The identifier sent back to Lambda in `batchItemFailures`.
   */
  readonly mapMessageId?: (record: SQSRecord) => string;
}
