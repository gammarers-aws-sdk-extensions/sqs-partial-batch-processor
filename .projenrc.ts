import { javascript, typescript, github } from 'projen';

const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'sqs-partial-batch-processor',
  packageManager: javascript.NodePackageManager.YARN_CLASSIC,
  projenrcTs: true,
  authorName: 'yicr',
  authorEmail: 'yicr@users.noreply.github.com',
  typescriptVersion: '6.0.x',
  repository: 'https://github.com/gammarers-aws-sdk-extensions/sqs-partial-batch-processor.git',
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
  npmAccess: javascript.NpmAccess.PUBLIC,
  minNodeVersion: '20.0.0',
  workflowNodeVersion: '24.x',
  deps: [
    '@types/aws-lambda@^8.10.145',
  ],
  depsUpgradeOptions: {
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
      schedule: javascript.UpgradeDependenciesSchedule.WEEKLY,
    },
  },
  githubOptions: {
    projenCredentials: github.GithubCredentials.fromApp({
      permissions: {
        pullRequests: github.workflows.AppPermission.WRITE,
        contents: github.workflows.AppPermission.WRITE,
        workflows: github.workflows.AppPermission.WRITE,
      },
    }),
  },
  autoApproveOptions: {
    allowedUsernames: [
      'gammarers-projen-upgrade-bot[bot]',
      'yicr',
    ],
  },
});
project.addPackageIgnore('/.devcontainer');
project.synth();
