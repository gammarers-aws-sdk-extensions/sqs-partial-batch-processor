import type { SQSRecord } from 'aws-lambda';
import { hasMessageGroupId, isMessageGroupFailed, messageGroupKey } from '../../src/core/message-group';
import { sqsRecord } from '../sqs-event';

const withGroup = (messageId: string, messageGroupId: string | undefined): SQSRecord => {
  const record = sqsRecord(messageId);

  if (messageGroupId === undefined) {
    return record;
  }

  return {
    ...record,
    attributes: {
      ...record.attributes,
      MessageGroupId: messageGroupId,
    },
  };
};

describe('hasMessageGroupId', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['A', true],
    ['orders', true],
  ] as const)('group id %s is present: %s', (groupId, expected) => {
    expect(hasMessageGroupId(groupId)).toBe(expected);
  });
});

describe('messageGroupKey', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['A', 'A'],
  ] as const)('attribute %s yields key %s', (messageGroupId, expected) => {
    expect(messageGroupKey(withGroup('m1', messageGroupId))).toBe(expected);
  });
});

describe('isMessageGroupFailed', () => {
  it.each([
    [undefined, [] as const, false],
    ['', [''] as const, false],
    ['A', [] as const, false],
    ['A', ['B'] as const, false],
    ['A', ['A'] as const, true],
  ])('key %s against %s is failed: %s', (groupKey, failed, expected) => {
    expect(isMessageGroupFailed(groupKey, new Set(failed))).toBe(expected);
  });
});
