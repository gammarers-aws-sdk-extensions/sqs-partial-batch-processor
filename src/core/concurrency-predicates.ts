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

/**
 * Returns whether a group already has a record in flight.
 *
 * An `undefined` key is not a group, so those records are never blocked.
 *
 * @param groupKey Group key for the candidate record.
 * @param inFlightGroups Groups that currently have a record running.
 * @returns `true` when this record must wait for an earlier record in the group.
 */
export const isGroupInFlight = (
  groupKey: string | undefined,
  inFlightGroups: ReadonlySet<string>,
): boolean => groupKey !== undefined && inFlightGroups.has(groupKey);

/**
 * Returns whether a group-pool worker should keep looping.
 *
 * The worker continues when it already holds a record, or when other records
 * are still waiting for a busy group to finish.
 *
 * @param claimed Whether this worker currently holds a record.
 * @param pendingCount Records not yet claimed.
 * @returns `true` when the worker should claim, wait, or process.
 */
export const hasQueuedGroupWork = (claimed: boolean, pendingCount: number): boolean =>
  claimed || pendingCount > 0;
