import {
  SqsPartialBatchProcessorError,
  SqsPartialBatchProcessorRangeError,
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
});
