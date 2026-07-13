# SQS Partial Batch Processor

[![npm](https://img.shields.io/npm/v/sqs-partial-batch-processor)](https://www.npmjs.com/package/sqs-partial-batch-processor)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-sdk-extensions/sqs-partial-batch-processor/build.yml?branch=main)](https://github.com/gammarers-aws-sdk-extensions/sqs-partial-batch-processor/actions/workflows/build.yml)

A small TypeScript helper for AWS Lambda SQS triggers using **partial batch responses** (`SQSBatchResponse.batchItemFailures`).
You supply per-record async logic; the library handles looping, per-record error boundaries, and the response shape.

This library intentionally does **not** parse message bodies, validate schemas, create AWS SDK clients, or make retry/business decisions for you.

## Features

- Implements Lambda SQS **partial batch response** pattern (only failed messages are retried).
- Per-record error boundary (failures are isolated to each record).
- Aggregates failed identifiers into `batchItemFailures` (defaults to `messageId`).
- Throw-style (`processPartialBatch`) and Result-style (`processPartialBatchWithResult`) APIs.
- Optional bounded concurrency (`concurrency`), error hook (`onRecordError`), and custom `itemIdentifier` mapping (`mapMessageId`).
- For `{ ok: false }`, `onRecordError` receives an `Error` that includes the resolved `itemIdentifier` (message and `cause`) for easier debugging.

## Requirements

- Node.js **20+** (runtime requirement)
- Module system: published as **CommonJS** (`"main": "lib/index.js"`). Usable from both CJS and ESM runtimes.
- Lambda SQS event source mapping has **Report batch item failures** enabled.
  See: [AWS Lambda SQS error handling docs](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html#services-sqs-batchfailurereporting)

## Installation

```bash
npm install sqs-partial-batch-processor
```

```bash
yarn add sqs-partial-batch-processor
```

## Usage

Throw to mark a record as failed:

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

- `concurrency?: number` (default: `1`): maximum parallelism. Must be a finite integer `>= 1` (`1` = sequential, `> 1` = bounded concurrency). If invalid, the function throws (`RangeError` for `< 1`, `TypeError` for non-integer / non-finite).
  - **Tip**: start with `1` and increase gradually while watching downstream limits (external API rate limits, DB connection pools, and Lambda reserved concurrency). SQS batches are typically small, so a large value rarely helps.
  - **Note**: when `concurrency > 1`, the order of `batchItemFailures` is **not guaranteed**. Tests should compare as a set, not by array order.
- `onRecordError?: (record, error) => void`: called when a record is treated as failed (useful for structured logs / metrics).
  - **Caution**: do **not** log `record.body` as-is in `onRecordError`. Message bodies often contain secrets or personal data. Prefer `messageId` / your `mapMessageId` result and a sanitized error summary.
  - When `processPartialBatchWithResult` receives `{ ok: false }`, the hook gets an `Error` whose message (and `cause.itemIdentifier`) includes the resolved `itemIdentifier` for easier debugging.
  - Example (structured log / metrics hook):

```ts
import { processPartialBatch } from 'sqs-partial-batch-processor';
import type { SQSEvent } from 'aws-lambda';

export const handler = async (event: SQSEvent) =>
  processPartialBatch(
    event,
    async (record) => {
      // ...
    },
    {
      onRecordError: (record, error) => {
        console.log(JSON.stringify({
          level: 'error',
          msg: 'record failed',
          messageId: record.messageId,
          // Do not log record.body — it may contain secrets or PII.
          error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
        }));
      },
    },
  );
```

- `mapMessageId?: (record) => string`: customize the `itemIdentifier` (defaults to `record.messageId`).
  - Typical uses: align the identifier with an **application-level id** (e.g., an id stored in `messageAttributes` or the parsed payload), or normalize identifiers across FIFO/standard queues for easier correlation.

## License

This project is licensed under the Apache-2.0 License.
