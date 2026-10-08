import {
  SqsPartialBatchProcessorError,
  SqsPartialBatchProcessorRangeError,
  SqsPartialBatchProcessorTypeError,
} from '../../src';
import { resolveConcurrency, runAtConcurrency, runWithConcurrency } from '../../src/core/concurrency';
import { MIN_CONCURRENCY } from '../../src/core/concurrency-predicates';

describe('resolveConcurrency', () => {
  it.each([
    [undefined, MIN_CONCURRENCY],
    [MIN_CONCURRENCY, MIN_CONCURRENCY],
    [3, 3],
  ] as const)('resolves %s to %s', (value, expected) => {
    expect(resolveConcurrency(value)).toBe(expected);
  });

  it.each([0, -1, -10])('throws SqsPartialBatchProcessorRangeError for invalid concurrency (%s)', (c) => {
    expect(() => resolveConcurrency(c)).toThrow(SqsPartialBatchProcessorRangeError);
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])('throws SqsPartialBatchProcessorTypeError for non-integer or non-finite concurrency (%s)', (c) => {
    expect(() => resolveConcurrency(c)).toThrow(SqsPartialBatchProcessorTypeError);
  });

  it('checks the range subclass before the base error', () => {
    let caught: unknown;
    try {
      resolveConcurrency(0);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SqsPartialBatchProcessorRangeError);
    expect(caught).toBeInstanceOf(SqsPartialBatchProcessorError);
    expect(caught).toMatchObject({
      name: 'SqsPartialBatchProcessorRangeError',
      message: `concurrency must be >= ${MIN_CONCURRENCY}`,
    });
  });
});

describe('runWithConcurrency', () => {
  it('returns without invoking the handler when items is empty', async () => {
    const fn = jest.fn(async () => {});
    await runWithConcurrency([], 2, fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it('invokes the handler for every item', async () => {
    const seen: number[] = [];
    await runWithConcurrency([1, 2, 3], 2, async (item) => {
      seen.push(item);
    });
    expect(new Set(seen)).toEqual(new Set([1, 2, 3]));
  });

  it('stops the only worker when an item is undefined', async () => {
    const seen: Array<number | undefined> = [];
    await runWithConcurrency([1, undefined, 3], 1, async (item) => {
      seen.push(item);
    });
    expect(seen).toEqual([1]);
  });
});

describe('runAtConcurrency', () => {
  it('runs items in order when concurrency is sequential', async () => {
    const seen: number[] = [];
    await runAtConcurrency([1, 2, 3], MIN_CONCURRENCY, async (item) => {
      seen.push(item);
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('invokes the handler for every item when concurrency is above the minimum', async () => {
    const seen: number[] = [];
    await runAtConcurrency([1, 2, 3, 4], 2, async (item) => {
      seen.push(item);
    });
    expect(new Set(seen)).toEqual(new Set([1, 2, 3, 4]));
  });
});
