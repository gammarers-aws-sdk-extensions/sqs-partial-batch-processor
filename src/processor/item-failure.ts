import type { SQSBatchResponse } from 'aws-lambda';

/**
 * Creates a single `batchItemFailures` entry for a failed record.
 *
 * @param itemIdentifier The identifier reported back to Lambda.
 * @returns An object suitable for {@link SQSBatchResponse.batchItemFailures}.
 */
export const itemFailure = (
  itemIdentifier: string,
): SQSBatchResponse['batchItemFailures'][number] => ({
  itemIdentifier,
});
