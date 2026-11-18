import {
  hasQueuedGroupWork,
  hasRemainingWork,
  isGroupInFlight,
  isSequentialConcurrency,
  MIN_CONCURRENCY,
} from './concurrency-predicates';
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
 * One queued record and the group it belongs to, if any.
 */
type GroupWork<T> = {
  readonly item: T;
  readonly groupKey: string | undefined;
};

/**
 * Runs `fn` over `items` with at most `concurrency` parallel workers.
 *
 * Items that share a group key run one at a time, in input order.
 * Example: `A1, B1, A2` with concurrency 2 runs `A1` and `B1` together,
 * and starts `A2` only after `A1` finishes. An `undefined` key does not
 * join a group, so those items may run together.
 *
 * Workers that find only busy groups wait. A handler throw releases the
 * group and lets a waiting worker take the next item before the pool rejects.
 *
 * @param items Items to process.
 * @param concurrency Maximum parallel workers (validated integer `>= 1`).
 * @param groupKey Returns the group key for an item, or `undefined` when it has no group.
 * @param fn Async handler invoked for each item.
 * @returns A promise that resolves when every item has been processed.
 */
export const runWithGroupConcurrency = async <T>(
  items: readonly T[],
  concurrency: number,
  groupKey: (item: T) => string | undefined,
  fn: (item: T) => Promise<void>,
): Promise<void> => {
  if (items.length === 0) {
    return;
  }

  const pending: GroupWork<T>[] = items.map((item) => ({
    item,
    groupKey: groupKey(item),
  }));
  const inFlightGroups = new Set<string>();
  let waiters: (() => void)[] = [];

  /**
   * Wakes every worker parked on a busy group.
   */
  const notifyWaiters = (): void => {
    const parked = waiters;
    waiters = [];
    for (const wake of parked) {
      wake();
    }
  };

  /**
   * Claims the earliest item whose group is not already running.
   *
   * @returns The next item, or `undefined` when the queue is empty or every
   * remaining item belongs to a busy group.
   */
  const claim = (): GroupWork<T> | undefined => {
    const position = pending.findIndex((entry) => !isGroupInFlight(entry.groupKey, inFlightGroups));
    const next = pending[position];

    if (next === undefined) {
      return undefined;
    }

    pending.splice(position, 1);

    if (next.groupKey !== undefined) {
      inFlightGroups.add(next.groupKey);
    }

    return next;
  };

  /**
   * Drops the in-flight mark so the next record in the group can start.
   *
   * @param key Group key of the record that just finished.
   */
  const release = (key: string | undefined): void => {
    if (key === undefined) {
      return;
    }

    inFlightGroups.delete(key);
  };

  /**
   * Parks until a running group releases its key.
   *
   * @returns A promise that resolves on the next release.
   */
  const parkUntilReleased = (): Promise<void> => new Promise((resolve) => {
    waiters.push(resolve);
  });

  const limit = Math.min(concurrency, items.length);
  const workers: Promise<void>[] = [];

  for (let worker = 0; worker < limit; worker++) {
    workers.push((async () => {
      let claimed = claim();

      while (hasQueuedGroupWork(claimed !== undefined, pending.length)) {
        if (claimed === undefined) {
          await parkUntilReleased();
          claimed = claim();
          continue;
        }

        const current = claimed;

        try {
          await fn(current.item);
        } finally {
          release(current.groupKey);
          notifyWaiters();
        }

        claimed = claim();
      }
    })());
  }

  const settled = await Promise.allSettled(workers);

  for (const result of settled) {
    if (result.status === 'rejected') {
      throw result.reason;
    }
  }
};

/**
 * Runs `fn` over `items` one at a time, or through a bounded worker pool.
 *
 * When `groupKey` is set and `concurrency` is greater than 1, items that share
 * a key run one at a time. Sequential concurrency keeps input order and does
 * not consult `groupKey`.
 *
 * @param items Items to process.
 * @param concurrency User-provided concurrency. Omitted means sequential.
 * @param fn Async handler invoked for each item.
 * @param groupKey Optional group key. Same key means one at a time, in input order.
 * @returns A promise that resolves when every item has been processed.
 * @throws {@link SqsPartialBatchProcessorRangeError} When `concurrency` is less than {@link MIN_CONCURRENCY}.
 * @throws {@link SqsPartialBatchProcessorTypeError} When `concurrency` is not a finite integer.
 */
export const runAtConcurrency = async <T>(
  items: readonly T[],
  concurrency: number | undefined,
  fn: (item: T) => Promise<void>,
  groupKey?: (item: T) => string | undefined,
): Promise<void> => {
  const limit = resolveConcurrency(concurrency);

  if (isSequentialConcurrency(limit)) {
    for (const item of items) {
      await fn(item);
    }
    return;
  }

  if (groupKey === undefined) {
    await runWithConcurrency(items, limit, fn);
    return;
  }

  await runWithGroupConcurrency(items, limit, groupKey, fn);
};
