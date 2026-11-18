import type { SQSRecord } from 'aws-lambda';

/**
 * Returns whether `groupId` is a FIFO message group id.
 *
 * SQS group ids are non-empty. Standard-queue records omit the attribute,
 * and an empty string is treated as no group.
 *
 * @param groupId Raw `MessageGroupId` attribute value.
 * @returns `true` when `groupId` is a non-empty string.
 */
export const hasMessageGroupId = (groupId: string | undefined): groupId is string =>
  groupId !== undefined && groupId.length > 0;

/**
 * Returns the FIFO group key for a record.
 *
 * Records without a non-empty `attributes.MessageGroupId` stay independent.
 *
 * @param record The SQS record being scheduled.
 * @returns The group key, or `undefined` when the record is not in a FIFO group.
 */
export const messageGroupKey = (record: SQSRecord): string | undefined => {
  const groupId = record.attributes.MessageGroupId;

  if (!hasMessageGroupId(groupId)) {
    return undefined;
  }

  return groupId;
};

/**
 * Returns whether this group has already failed in the current batch.
 *
 * A missing or empty key is never failed, so ungrouped records stay independent.
 *
 * @param groupKey Group key from {@link messageGroupKey}.
 * @param failedGroups Groups that already produced a failure.
 * @returns `true` when later records in this group must be reported as failures.
 */
export const isMessageGroupFailed = (
  groupKey: string | undefined,
  failedGroups: ReadonlySet<string>,
): boolean => hasMessageGroupId(groupKey) && failedGroups.has(groupKey);
