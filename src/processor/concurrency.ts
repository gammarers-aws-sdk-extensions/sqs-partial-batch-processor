/**
 * Returns whether a worker still has an index to process.
 *
 * @param workIndex The index claimed from the work queue, or `undefined` when empty.
 * @returns `true` when `workIndex` is a remaining item index.
 */
const hasRemainingWork = (workIndex: number | undefined): workIndex is number =>
  workIndex !== undefined;

/**
 * Resolves and validates the `concurrency` option.
 *
 * @param value User-provided concurrency.
 * @returns A validated concurrency value (defaults to `1`).
 * @throws {RangeError} When `value` is less than 1.
 * @throws {TypeError} When `value` is not a finite integer.
 */
export const resolveConcurrency = (value: number | undefined): number => {
  if (value === undefined) {
    return 1;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError('concurrency must be a finite integer');
  }
  if (value < 1) {
    throw new RangeError('concurrency must be >= 1');
  }
  return value;
};

/**
 * Runs `fn` over `items` with at most `concurrency` parallel workers.
 * Each worker pulls the next index until none remain.
 *
 * @param items Items to process.
 * @param concurrency Maximum parallel workers (must be `>= 1`).
 * @param fn Async handler invoked for each item.
 * @returns A promise that resolves when every item has been processed.
 */
export const runWithConcurrency = async <T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> => {
  if (items.length === 0) {
    return;
  }
  const limit = Math.min(concurrency, items.length);
  let next = 0;

  /**
   * Claims the next work index, or `undefined` when the queue is empty.
   *
   * @returns The next index to process, or `undefined` if none remain.
   */
  const takeNextIndex = (): number | undefined => {
    const index = next;
    next += 1;
    if (index >= items.length) {
      return undefined;
    }
    return index;
  };

  const workers: Promise<void>[] = [];
  for (let w = 0; w < limit; w++) {
    workers.push((async () => {
      let workIndex = takeNextIndex();
      while (hasRemainingWork(workIndex)) {
        const item = items[workIndex];
        if (item === undefined) {
          return;
        }
        await fn(item);
        workIndex = takeNextIndex();
      }
    })());
  }
  await Promise.all(workers);
};
