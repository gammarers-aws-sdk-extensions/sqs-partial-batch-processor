import type { SQSRecord } from 'aws-lambda';

/**
 * Result of a per-record handler used by {@link processPartialBatchWithResult}.
 *
 * - `{ ok: true }`: success (not listed in `batchItemFailures`)
 * - `{ ok: false }`: failure (listed in `batchItemFailures`)
 */
export type ProcessRecordResult = { ok: true } | { ok: false };

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
