import { ProjenTypeScriptProject } from '@gammarers/projen-projects';
const project = new ProjenTypeScriptProject({
  name: 'sqs-partial-batch-processor',
  authorName: 'yicr',
  authorEmail: 'yicr@users.noreply.github.com',
  repositoryUrl: 'https://github.com/gammarers-aws-sdk-extensions/sqs-partial-batch-processor.git',
  description: 'A small TypeScript helper for AWS Lambda SQS triggers using partial batch responses (SQSBatchResponse.batchItemFailures). You supply per-record async logic; the library handles looping, per-record error boundaries, and the response shape.',
  keywords: [
    'aws',
    'sqs',
    'partial',
    'batch',
    'processor',
  ],
  releaseToNpm: true,
  npmTrustedPublishing: true,
  deps: [
    '@types/aws-lambda@^8.10.145',
  ],
  devDeps: [
    '@gammarers/projen-projects@^0.5.7',
  ],
});
project.synth();
