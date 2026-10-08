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
 * Thrown when `concurrency` is less than 1.
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
 * Thrown when `concurrency` is not a finite integer.
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
