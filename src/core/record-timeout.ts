import { SqsPartialBatchProcessorRangeError, SqsPartialBatchProcessorTimeoutError, SqsPartialBatchProcessorTypeError } from './errors';

/**
 * Minimum accepted `recordTimeoutMs`.
 */
export const MIN_RECORD_TIMEOUT_MS = 1;

/**
 * Resolves the optional per-record time limit.
 *
 * @param value User-provided `recordTimeoutMs`. Omitted means no limit.
 * @returns The validated limit, or `undefined` when the caller set no limit.
 * @throws {@link SqsPartialBatchProcessorRangeError} When `value` is less than {@link MIN_RECORD_TIMEOUT_MS}.
 * @throws {@link SqsPartialBatchProcessorTypeError} When `value` is not a finite integer.
 */
export const resolveRecordTimeout = (value: number | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new SqsPartialBatchProcessorTypeError('recordTimeoutMs must be a finite integer');
  }
  if (value < MIN_RECORD_TIMEOUT_MS) {
    throw new SqsPartialBatchProcessorRangeError(`recordTimeoutMs must be >= ${MIN_RECORD_TIMEOUT_MS}`);
  }
  return value;
};

/**
 * Waits for `work` until `timeoutMs` elapses.
 *
 * The timer is cleared when `work` settles first. A late settlement from `work`
 * does not change the result after the limit wins. This does not cancel `work`.
 *
 * @param work Handler promise for one record.
 * @param timeoutMs Validated `recordTimeoutMs`.
 * @param messageId SQS message id of the record being timed.
 * @returns A promise that settles with `work`, or rejects when the limit elapses.
 */
export const waitWithinLimit = (
  work: Promise<void>,
  timeoutMs: number,
  messageId: string,
): Promise<void> => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  const timer = setTimeout(() => {
    const elapsedMs = Date.now() - startedAt;
    reject(new SqsPartialBatchProcessorTimeoutError(
      `Record ${messageId} exceeded recordTimeoutMs ${timeoutMs} after ${elapsedMs}ms.`,
    ));
  }, timeoutMs);

  void work.then(
    () => {
      clearTimeout(timer);
      resolve();
    },
    (error: unknown) => {
      clearTimeout(timer);
      reject(error);
    },
  );
});
