import { hasRemainingWork, isSequentialConcurrency, MIN_CONCURRENCY } from './concurrency-predicates';
import { SqsPartialBatchProcessorRangeError, SqsPartialBatchProcessorTypeError } from './errors';

/**
 * Resolves and validates the `concurrency` option.
 *
 * @param value User-provided concurrency.
 * @returns A validated concurrency value (defaults to {@link MIN_CONCURRENCY}).
 * @throws {@link SqsPartialBatchProcessorRangeError} When `value` is less than {@link MIN_CONCURRENCY}.
 * @throws {@link SqsPartialBatchProcessorTypeError} When `value` is not a finite integer.
 */
export const resolveConcurrency = (value: number | undefined): number => {
  if (value === undefined) {
    return MIN_CONCURRENCY;
  }
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new SqsPartialBatchProcessorTypeError('concurrency must be a finite integer');
  }
  if (value < MIN_CONCURRENCY) {
    throw new SqsPartialBatchProcessorRangeError(`concurrency must be >= ${MIN_CONCURRENCY}`);
  }
  return value;
};

/**
 * Runs `fn` over `items` with at most `concurrency` parallel workers.
 * Each worker pulls the next index until none remain.
 *
 * An `undefined` item ends that worker. With one worker, later indexes stay unclaimed.
 *
 * @param items Items to process.
 * @param concurrency Maximum parallel workers (validated integer `>= 1`).
 * @param fn Async handler invoked for each item.
 * @returns A promise that resolves when every claimed item has been processed.
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

/**
 * Runs `fn` over `items` one at a time, or through the bounded worker pool.
 *
 * @param items Items to process.
 * @param concurrency User-provided concurrency. Omitted means sequential.
 * @param fn Async handler invoked for each item.
 * @returns A promise that resolves when every item has been processed.
 * @throws {@link SqsPartialBatchProcessorRangeError} When `concurrency` is less than {@link MIN_CONCURRENCY}.
 * @throws {@link SqsPartialBatchProcessorTypeError} When `concurrency` is not a finite integer.
 */
export const runAtConcurrency = async <T>(
  items: readonly T[],
  concurrency: number | undefined,
  fn: (item: T) => Promise<void>,
): Promise<void> => {
  const limit = resolveConcurrency(concurrency);

  if (isSequentialConcurrency(limit)) {
    for (const item of items) {
      await fn(item);
    }
    return;
  }

  await runWithConcurrency(items, limit, fn);
};
