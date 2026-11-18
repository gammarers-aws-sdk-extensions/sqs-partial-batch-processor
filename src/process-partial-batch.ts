import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import { runAtConcurrency } from './core/concurrency';
import { itemFailure } from './core/item-failure';
import { isMessageGroupFailed, messageGroupKey } from './core/message-group';
import { resolveRecordTimeout, waitWithinLimit } from './core/record-timeout';
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
 * Records that share `attributes.MessageGroupId` are one FIFO group. The group
 * runs one record at a time, including when `concurrency` is greater than 1.
 * After the first failure in a group, later records in that group are listed
 * in `batchItemFailures` and `processRecord` is not called for them. Earlier
 * successes in the group stay out of the list. Records with no group id fail
 * independently.
 *
 * `recordTimeoutMs` limits how long the processor waits for one handler. On
 * expiry that record fails with {@link SqsPartialBatchProcessorTimeoutError}.
 * Later records in the same `MessageGroupId` are reported and their handlers
 * are not called. Records outside that group still run. The handler call is
 * not cancelled.
 *
 * @param event The SQS Lambda event.
 * @param processRecord Per-record handler. Throw to mark only that record as failed.
 * @param options Optional concurrency, record timeout, error hook, and message id mapping.
 * @returns An {@link SQSBatchResponse} listing only failed `itemIdentifier`s.
 * @throws {@link SqsPartialBatchProcessorRangeError} When `concurrency` or `recordTimeoutMs` is less than 1.
 * @throws {@link SqsPartialBatchProcessorTypeError} When `concurrency` or `recordTimeoutMs` is not a finite integer.
 */
export const processPartialBatch = async (
  event: SQSEvent,
  processRecord: (record: SQSRecord) => Promise<void>,
  options?: ProcessPartialBatchOptions,
): Promise<SQSBatchResponse> => {
  const recordTimeoutMs = resolveRecordTimeout(options?.recordTimeoutMs);
  const batchItemFailures: { itemIdentifier: string }[] = [];
  const failedGroups = new Set<string>();

  /**
   * Runs the handler, applying the per-record limit when one is set.
   *
   * @param record The SQS record whose handler should run.
   * @returns The handler promise, or the same work bounded by `recordTimeoutMs`.
   */
  const runHandler = (record: SQSRecord): Promise<void> => {
    if (recordTimeoutMs === undefined) {
      return processRecord(record);
    }
    return waitWithinLimit(processRecord(record), recordTimeoutMs, record.messageId);
  };

  /**
   * Reports a record that follows a failed message in the same FIFO group.
   *
   * The handler is not called. `onRecordError` runs only when `mapMessageId` throws.
   *
   * @param record The SQS record skipped after an earlier group failure.
   */
  const reportGroupTail = (record: SQSRecord): void => {
    try {
      const id = options?.mapMessageId?.(record) ?? record.messageId;
      batchItemFailures.push(itemFailure(id));
    } catch (error) {
      reportRecordFailure(batchItemFailures, record, record.messageId, error, options?.onRecordError);
    }
  };

  /**
   * Processes one record and records a batch item failure on error.
   *
   * Identifier resolution and the error hook stay inside this boundary.
   * A failure also stops the rest of that FIFO group.
   *
   * @param record The SQS record to process.
   */
  const handle = async (record: SQSRecord): Promise<void> => {
    const groupKey = messageGroupKey(record);

    if (isMessageGroupFailed(groupKey, failedGroups)) {
      reportGroupTail(record);
      return;
    }

    let id = record.messageId;

    try {
      id = options?.mapMessageId?.(record) ?? record.messageId;
      await runHandler(record);
    } catch (error) {
      // Mark the group before reporting so the next record cannot start
      // and miss this failure. Lambda would otherwise delete that later
      // message and redeliver only the failed one, breaking FIFO order.
      if (groupKey !== undefined) {
        failedGroups.add(groupKey);
      }
      reportRecordFailure(batchItemFailures, record, id, error, options?.onRecordError);
    }
  };

  await runAtConcurrency(event.Records, options?.concurrency, handle, messageGroupKey);
  return { batchItemFailures };
};
