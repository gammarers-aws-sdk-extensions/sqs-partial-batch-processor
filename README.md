# SQS Partial Batch Processor

[![npm](https://img.shields.io/npm/v/sqs-partial-batch-processor)](https://www.npmjs.com/package/sqs-partial-batch-processor)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-sdk-extensions/sqs-partial-batch-processor/build.yml?branch=main)](https://github.com/gammarers-aws-sdk-extensions/sqs-partial-batch-processor/actions/workflows/build.yml)

A small TypeScript helper for AWS Lambda SQS triggers using **partial batch responses** (`SQSBatchResponse.batchItemFailures`).
You supply per-record async logic; the library handles looping, per-record error boundaries, and the response shape.

This library intentionally does **not** parse message bodies, validate schemas, create AWS SDK clients, or make retry/business decisions for you.

## Features

- Implements Lambda SQS **partial batch response** pattern (only failed messages are retried).
- Per-record error boundary (failures are isolated to each record).
- Aggregates failed `messageId`s into `batchItemFailures`.
- Optional bounded concurrency (`concurrency`) and error hook (`onRecordError`).

## Requirements

- Node.js **20+**
- Lambda SQS event source mapping has **Report batch item failures** enabled.
  See the AWS docs: https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html#services-sqs-batchfailurereporting

## Installation

```bash
npm install sqs-partial-batch-processor
```

```bash
yarn add sqs-partial-batch-processor
```

## Usage

```ts
import type { SQSEvent } from 'aws-lambda';
import { processPartialBatch } from 'sqs-partial-batch-processor';

export const handler = async (event: SQSEvent) =>
  processPartialBatch(event, async (record) => {
    // Your per-record logic here.
    // Throw to mark only this record's messageId as failed.
  });
```

Result-style callback (no throw for control flow):

```ts
import type { SQSEvent } from 'aws-lambda';
import { processPartialBatchWithResult } from 'sqs-partial-batch-processor';

export const handler = async (event: SQSEvent) =>
  processPartialBatchWithResult(event, async (record) => {
    if (record.body === '') {
      return { ok: false };
    }
    return { ok: true };
  });
```

## Options

Both `processPartialBatch` and `processPartialBatchWithResult` accept an optional `options` object:

- `concurrency?: number` (default: `1`): bounded parallelism. Order of `batchItemFailures` is not guaranteed.
- `onRecordError?: (record, error) => void`: called when a record is treated as failed (useful for logging/metrics).
- `mapMessageId?: (record) => string`: customize the `itemIdentifier` (defaults to `record.messageId`).

## License

This project is licensed under the (Apache-2.0) License.
