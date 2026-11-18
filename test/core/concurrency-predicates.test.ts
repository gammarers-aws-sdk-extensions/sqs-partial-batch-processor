import {
  hasQueuedGroupWork,
  hasRemainingWork,
  isGroupInFlight,
  isSequentialConcurrency,
} from '../../src/core/concurrency-predicates';

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

describe('isGroupInFlight', () => {
  it.each([
    [undefined, [] as const, false],
    [undefined, ['A'] as const, false],
    ['A', [] as const, false],
    ['A', ['B'] as const, false],
    ['A', ['A'] as const, true],
    ['A', ['A', 'B'] as const, true],
    ['', [''] as const, true],
  ])('group %s held in %s is in flight: %s', (groupKey, held, expected) => {
    expect(isGroupInFlight(groupKey, new Set(held))).toBe(expected);
  });
});

describe('hasQueuedGroupWork', () => {
  it.each([
    [false, 0, false],
    [true, 0, true],
    [false, 2, true],
    [true, 3, true],
  ] as const)('claimed %s with %s pending has work: %s', (claimed, pendingCount, expected) => {
    expect(hasQueuedGroupWork(claimed, pendingCount)).toBe(expected);
  });
});
