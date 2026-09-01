import type { SQSEvent, SQSRecord } from 'aws-lambda';

/**
 * Builds a minimal SQS record for tests.
 *
 * @param messageId SQS message id (also used as `itemIdentifier` by default).
 * @param body Message body.
 * @returns A stub {@link SQSRecord}.
 */
export const sqsRecord = (messageId: string, body = '{}'): SQSRecord => ({
  messageId,
  receiptHandle: `rh-${messageId}`,
  body,
  attributes: {
    ApproximateReceiveCount: '1',
    SentTimestamp: '0',
    SenderId: 'sender',
    ApproximateFirstReceiveTimestamp: '0',
  },
  messageAttributes: {},
  md5OfBody: 'md5',
  eventSource: 'aws:sqs',
  eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:q',
  awsRegion: 'us-east-1',
});

/**
 * Wraps records into an SQS Lambda event.
 *
 * @param records SQS records.
 * @returns An {@link SQSEvent}.
 */
export const event = (...records: SQSRecord[]): SQSEvent => ({
  Records: records,
});
