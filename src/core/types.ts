import type { SQSRecord } from 'aws-lambda';

/**
 * Options for {@link processPartialBatch}.
 */
export interface ProcessPartialBatchOptions {
  /**
   * Maximum number of records processed in parallel.
   *
   * - `1`: sequential processing
   * - `> 1`: bounded concurrency pool. Records that share a `MessageGroupId`
   *   still run one at a time. The order of {@link SQSBatchResponse.batchItemFailures}
   *   is not guaranteed.
   *
   * Records with the same `MessageGroupId` run one at a time at every value,
   * including `1`. After the first failure in that group, later records in the
   * group are included in `batchItemFailures` and their handlers are not called.
   *
   * @default 1
   * @throws {@link SqsPartialBatchProcessorRangeError} When `concurrency` is less than 1.
   * @throws {@link SqsPartialBatchProcessorTypeError} When `concurrency` is not a finite integer.
   */
  readonly concurrency?: number;

  /**
   * Maximum time to wait for one record handler, in milliseconds.
   *
   * When the handler does not settle in time, that record is listed in
   * `batchItemFailures` with {@link SqsPartialBatchProcessorTimeoutError} and
   * the other records still run. The handler call is not cancelled. Omit this
   * option to wait until the handler settles.
   *
   * A timed-out record is a group failure. Later records that share its
   * `MessageGroupId` are reported and their handlers are not called.
   *
   * @throws {@link SqsPartialBatchProcessorRangeError} When `recordTimeoutMs` is less than 1.
   * @throws {@link SqsPartialBatchProcessorTypeError} When `recordTimeoutMs` is not a finite integer.
   */
  readonly recordTimeoutMs?: number;

  /**
   * Called when a record handler throws, and when a record exceeds `recordTimeoutMs`.
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
   * Records skipped because an earlier record in the same message group failed
   * are listed in `batchItemFailures` and do not call this hook, unless
   * `mapMessageId` throws while resolving their identifier.
   *
   * @param record The failed SQS record.
   * @param error The value thrown by the record handler or by `mapMessageId`,
   * or a {@link SqsPartialBatchProcessorTimeoutError} when the record exceeds `recordTimeoutMs`.
   */
  readonly onRecordError?: (record: SQSRecord, error: unknown) => void;

  /**
   * Returns the `itemIdentifier` reported in `batchItemFailures` for a record.
   * Defaults to `record.messageId` when omitted.
   *
   * When this function throws, that record is reported with `record.messageId`
   * and the thrown value is passed to `onRecordError` when the hook is set.
   * Later records in the same `MessageGroupId` are reported as failures and
   * their handlers are not called. Records in other groups are still processed.
   * A record skipped after an earlier group failure still uses this function
   * for its identifier. A throw there reports `record.messageId`.
   *
   * @param record The SQS record being processed.
   * @returns The identifier sent back to Lambda in `batchItemFailures`.
   */
  readonly mapMessageId?: (record: SQSRecord) => string;
}
