import { hasRemainingWork, isSequentialConcurrency } from '../../src/core/concurrency-predicates';

describe('isSequentialConcurrency', () => {
  it.each([
    [0, true],
    [1, true],
    [2, false],
    [8, false],
  ] as const)('concurrency %s is sequential: %s', (concurrency, expected) => {
    expect(isSequentialConcurrency(concurrency)).toBe(expected);
  });
});

describe('hasRemainingWork', () => {
  it.each([
    [undefined, false],
    [0, true],
    [1, true],
    [4, true],
  ] as const)('work index %s has remaining work: %s', (workIndex, expected) => {
    expect(hasRemainingWork(workIndex)).toBe(expected);
  });
});
