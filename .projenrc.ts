import { javascript, typescript, github } from 'projen';
const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: 'sqs-partial-batch-processor',
  packageManager: javascript.NodePackageManager.YARN_CLASSIC,
  projenrcTs: true,
  authorName: 'yicr',
  authorEmail: 'yicr@users.noreply.github.com',
  typescriptVersion: '5.9.x',
  repository: 'https://github.com/gammarers-aws-sdk-extensions/sqs-partial-batch-processor.git',
  releaseToNpm: false,
  // npmTrustedPublishing: true,
  npmAccess: javascript.NpmAccess.PUBLIC,
  minNodeVersion: '20.0.0',
  workflowNodeVersion: '24.x',
  deps: [
    '@aws-sdk/client-sqs@^3.983.0',
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
// package ignore .devcontainer directory
project.addPackageIgnore('/.devcontainer');
// do synth
project.synth();