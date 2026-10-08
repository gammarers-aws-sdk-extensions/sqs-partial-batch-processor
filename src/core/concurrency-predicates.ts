/**
 * Minimum accepted `concurrency`. Also the default when the option is omitted.
 */
export const MIN_CONCURRENCY = 1;

/**
 * Returns whether records run one at a time.
 *
 * @param concurrency Validated concurrency value.
 * @returns `true` when `concurrency` is at most {@link MIN_CONCURRENCY}.
 */
export const isSequentialConcurrency = (concurrency: number): boolean =>
  concurrency <= MIN_CONCURRENCY;

/**
 * Returns whether a worker still has an index to process.
 *
 * @param workIndex The index claimed from the work queue, or `undefined` when empty.
 * @returns `true` when `workIndex` is a remaining item index.
 */
export const hasRemainingWork = (workIndex: number | undefined): workIndex is number =>
  workIndex !== undefined;
