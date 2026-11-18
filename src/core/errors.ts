/**
 * Base error for failures thrown by this package.
 */
export abstract class SqsPartialBatchProcessorError extends Error {
  override readonly name: string = 'SqsPartialBatchProcessorError';

  /**
   * @param message Error message.
   */
  protected constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SqsPartialBatchProcessorError.prototype);
  }
}

/**
 * Thrown when a numeric option is below its minimum.
 *
 * `concurrency` and `recordTimeoutMs` must be greater than or equal to 1.
 */
export class SqsPartialBatchProcessorRangeError extends SqsPartialBatchProcessorError {
  override readonly name: string = 'SqsPartialBatchProcessorRangeError';

  /**
   * @param message Error message.
   */
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SqsPartialBatchProcessorRangeError.prototype);
  }
}

/**
 * Thrown when a numeric option is not a finite integer.
 *
 * Applies to `concurrency` and `recordTimeoutMs`.
 */
export class SqsPartialBatchProcessorTypeError extends SqsPartialBatchProcessorError {
  override readonly name: string = 'SqsPartialBatchProcessorTypeError';

  /**
   * @param message Error message.
   */
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SqsPartialBatchProcessorTypeError.prototype);
  }
}

/**
 * Reported when a record handler does not finish within `recordTimeoutMs`.
 *
 * {@link processPartialBatch} catches this for that record and lists it in
 * `batchItemFailures`. Later records in the same `MessageGroupId` are reported
 * and their handlers are not called. Records outside that group still run.
 */
export class SqsPartialBatchProcessorTimeoutError extends SqsPartialBatchProcessorError {
  override readonly name: string = 'SqsPartialBatchProcessorTimeoutError';

  /**
   * @param message Error message.
   */
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, SqsPartialBatchProcessorTimeoutError.prototype);
  }
}
