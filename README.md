# SQS Partial Batch Processor

[![npm version](https://img.shields.io/npm/v/sqs-partial-batch-processor?style=flat-square)](https://www.npmjs.com/package/sqs-partial-batch-processor)
[![license](https://img.shields.io/npm/l/sqs-partial-batch-processor?style=flat-square)](https://www.npmjs.com/package/sqs-partial-batch-processor)
[![Node.js](https://img.shields.io/node/v/sqs-partial-batch-processor?style=flat-square)](https://www.npmjs.com/package/sqs-partial-batch-processor)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-sdk-extensions/sqs-partial-batch-processor/build.yml?label=build&style=flat-square)](https://github.com/gammarers-aws-sdk-extensions/sqs-partial-batch-processor/actions/workflows/build.yml)

A small TypeScript helper for AWS Lambda SQS triggers using **partial batch responses** (`SQSBatchResponse.batchItemFailures`).
You supply per-record async logic; the library handles looping, per-record error boundaries, and the response shape.

## Features

- Implements the Lambda SQS partial batch response pattern, so only failed messages are retried.
- Keeps a thrown error inside the record boundary that raised it.
- Aggregates failed identifiers into `batchItemFailures` (defaults to `messageId`).
- Preserves FIFO order inside a `MessageGroupId`. The first failure in a group also reports every later record in that group, and those handlers are not called. The same group runs one record at a time when `concurrency` is greater than 1. Records without a group id still fail independently.
- Marks a record failed by throwing from the per-record function passed to `processPartialBatch`.
- Accepts bounded concurrency (`concurrency`), an error hook (`onRecordError`), and custom `itemIdentifier` mapping (`mapMessageId`) through `ProcessPartialBatchOptions`.
- Throws `SqsPartialBatchProcessorRangeError` or `SqsPartialBatchProcessorTypeError` for invalid `concurrency`. Check the subclass before `SqsPartialBatchProcessorError`.

## How it works

An SQS event source mapping invokes your Lambda function with a batch of records. Pass that event and a per-record function to `processPartialBatch`. Throw from that function to fail that record. The returned `SQSBatchResponse` lists failed records in `batchItemFailures`. Enable **Report batch item failures** on the event source mapping so SQS retries those messages and deletes the successful ones. See the [AWS Lambda SQS error handling docs](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html#services-sqs-batchfailurereporting).

Records with the same `MessageGroupId` stay in batch order. A failure reports that record and every later record in the group, and the later handlers do not run. Those later identifiers still come from `mapMessageId` when it is set. Earlier records in the group are left out of `batchItemFailures`, so SQS can delete them. Other groups keep running. This holds for `concurrency` of 1 and for higher values. A higher value still runs each group one record at a time and can run different groups in parallel. Records with no group id fail on their own.

Your function owns message parsing, schema validation, AWS SDK clients, and retry policy. The package is published as CommonJS (`lib/index.js`) and can be imported from CommonJS or ESM.

## Installation

### npm

```bash
npm install sqs-partial-batch-processor
```

### yarn

```bash
yarn add sqs-partial-batch-processor
```

### pnpm

```bash
pnpm add sqs-partial-batch-processor
```

## Usage

Import the public API from the package root.

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

`onRecordError` is a logging or metrics hook. A throw from the hook stays on that record.

```ts
import type { SQSEvent } from 'aws-lambda';
import { processPartialBatch } from 'sqs-partial-batch-processor';

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
          // Avoid logging record.body — it may contain secrets or personal data.
          error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
        }));
      },
    },
  );
```

## Options

`processPartialBatch` accepts an optional `ProcessPartialBatchOptions` object.

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `concurrency` | `number` | `1` | Maximum number of records processed in parallel. `1` runs records one at a time. A value greater than `1` uses a bounded pool, and the order of `batchItemFailures` is not guaranteed. Records that share a `MessageGroupId` run one at a time at any concurrency. After the first failure in that group, later records in the group are included in `batchItemFailures` and their handlers are not called. The value must be a finite integer greater than or equal to 1. A smaller value throws `SqsPartialBatchProcessorRangeError`. Any other invalid value throws `SqsPartialBatchProcessorTypeError`. Check the subclass before `SqsPartialBatchProcessorError`. Start with `1` and raise it while watching downstream limits such as API rate limits, database pools, and Lambda reserved concurrency. |
| `onRecordError` | `(record, error) => void` |  | Called when a record handler or `mapMessageId` throws. A throw from this hook leaves that record in `batchItemFailures` and lets records outside that message group continue. Avoid logging `record.body`. Prefer `messageId`, the `mapMessageId` result, and a sanitized error summary. When `mapMessageId` throws, `error` is that thrown value and the reported identifier is `record.messageId`. Later records skipped because an earlier record in the same group failed do not call this hook, unless `mapMessageId` throws while resolving their identifier. |
| `mapMessageId` | `(record) => string` | `record.messageId` | Returns the `itemIdentifier` reported for a record. Use it to align the identifier with an application-level id, such as one stored in `messageAttributes` or the parsed payload. When this function throws, that record is reported with `record.messageId` and the thrown value is passed to `onRecordError`. Later records in the same message group are reported as failures without calling the handler. Records in other groups are still processed. A skipped later record still uses this function for its `itemIdentifier`. A throw there reports `record.messageId`. |

## Requirements

- Node.js `>= 20.0.0`

## License

This project is licensed under the Apache-2.0 License.
