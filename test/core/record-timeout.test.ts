import {
  SqsPartialBatchProcessorError,
  SqsPartialBatchProcessorRangeError,
  SqsPartialBatchProcessorTypeError,
} from '../../src';
import { MIN_RECORD_TIMEOUT_MS, resolveRecordTimeout } from '../../src/core/record-timeout';

describe('resolveRecordTimeout', () => {
  it.each([
    [undefined, undefined],
    [MIN_RECORD_TIMEOUT_MS, MIN_RECORD_TIMEOUT_MS],
    [30, 30],
  ] as const)('resolves %s to %s', (value, expected) => {
    expect(resolveRecordTimeout(value)).toBe(expected);
  });

  it.each([0, -1, -10])('throws SqsPartialBatchProcessorRangeError for recordTimeoutMs %s', (value) => {
    expect(() => resolveRecordTimeout(value)).toThrow(SqsPartialBatchProcessorRangeError);
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])('throws SqsPartialBatchProcessorTypeError for recordTimeoutMs %s', (value) => {
    expect(() => resolveRecordTimeout(value)).toThrow(SqsPartialBatchProcessorTypeError);
  });

  it('checks the range subclass before the base error', () => {
    let caught: unknown;
    try {
      resolveRecordTimeout(0);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SqsPartialBatchProcessorRangeError);
    expect(caught).toBeInstanceOf(SqsPartialBatchProcessorError);
    expect(caught).toMatchObject({
      name: 'SqsPartialBatchProcessorRangeError',
      message: `recordTimeoutMs must be >= ${MIN_RECORD_TIMEOUT_MS}`,
    });
  });
});
