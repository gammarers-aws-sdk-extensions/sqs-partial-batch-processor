import {
  SqsPartialBatchProcessorError,
  SqsPartialBatchProcessorRangeError,
  SqsPartialBatchProcessorTimeoutError,
  SqsPartialBatchProcessorTypeError,
} from '../src';

describe('package errors', () => {
  it('identifies a range failure as the subclass before the base', () => {
    const error = new SqsPartialBatchProcessorRangeError('low');
    expect(error).toBeInstanceOf(SqsPartialBatchProcessorRangeError);
    expect(error).toBeInstanceOf(SqsPartialBatchProcessorError);
    expect(error.name).toBe('SqsPartialBatchProcessorRangeError');
  });

  it('identifies a non-integer concurrency failure as the subclass before the base', () => {
    const error = new SqsPartialBatchProcessorTypeError('not-integer');
    expect(error).toBeInstanceOf(SqsPartialBatchProcessorTypeError);
    expect(error).toBeInstanceOf(SqsPartialBatchProcessorError);
    expect(error.name).toBe('SqsPartialBatchProcessorTypeError');
  });

  it('identifies a record timeout as the subclass before the base', () => {
    const error = new SqsPartialBatchProcessorTimeoutError('timed out');
    expect(error).toBeInstanceOf(SqsPartialBatchProcessorTimeoutError);
    expect(error).toBeInstanceOf(SqsPartialBatchProcessorError);
    expect(error.name).toBe('SqsPartialBatchProcessorTimeoutError');
  });
});
