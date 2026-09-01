import { resolveConcurrency, runWithConcurrency } from '../../src/processor/concurrency';

describe('resolveConcurrency', () => {
  it.each([
    [undefined, 1],
    [1, 1],
    [3, 3],
  ] as const)('resolves %s to %s', (value, expected) => {
    expect(resolveConcurrency(value)).toBe(expected);
  });

  it.each([0, -1, -10])('throws RangeError for invalid concurrency (%s)', (c) => {
    expect(() => resolveConcurrency(c)).toThrow(RangeError);
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])('throws TypeError for non-integer or non-finite concurrency (%s)', (c) => {
    expect(() => resolveConcurrency(c)).toThrow(TypeError);
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
});
