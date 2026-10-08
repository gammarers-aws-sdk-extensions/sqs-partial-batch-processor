import type { SQSBatchResponse, SQSRecord } from 'aws-lambda';
import type { ProcessPartialBatchOptions } from '../types';
import { itemFailure } from './item-failure';

/**
 * Reports one failed record inside the per-record boundary.
 *
 * Invokes `onRecordError` when set. A throw from the hook is caught here so
 * the processor promise still resolves and other records keep running.
 * The resolved `itemIdentifier` is always appended to `batchItemFailures`.
 *
 * @param batchItemFailures Failure list for the current batch.
 * @param record The SQS record that failed.
 * @param itemIdentifier Identifier already resolved for this record.
 * @param error The failure passed to `onRecordError`.
 * @param onRecordError Optional per-record error hook.
 */
export const reportRecordFailure = (
  batchItemFailures: SQSBatchResponse['batchItemFailures'],
  record: SQSRecord,
  itemIdentifier: string,
  error: unknown,
  onRecordError: ProcessPartialBatchOptions['onRecordError'],
): void => {
  try {
    onRecordError?.(record, error);
  } catch {
    // Hook failures stay inside this record. The item is still reported below.
  }
  batchItemFailures.push(itemFailure(itemIdentifier));
};
