# merge-me-action

[![license: MIT](https://img.shields.io/github/license/ridedott/merge-me-action)](https://github.com/ridedott/merge-me-action/blob/master/LICENSE)
[![Continuous Integration](https://github.com/ridedott/merge-me-action/workflows/Continuous%20Integration/badge.svg)](https://github.com/ridedott/merge-me-action/actions)
[![Continuous Delivery](https://github.com/ridedott/merge-me-action/workflows/Continuous%20Delivery/badge.svg)](https://github.com/ridedott/merge-me-action/actions)
[![Coveralls](https://coveralls.io/repos/github/ridedott/merge-me-action/badge.svg)](https://coveralls.io/github/ridedott/merge-me-action)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

This Action approves and attempts to merge Pull Requests when triggered.

By using
[branch protection](https://docs.github.com/en/free-pro-team@latest/github/administering-a-repository/about-protected-branches)
rules, it can be specified what the requirements are for a PR to be merged (e.g.
require branches to be up to date, require status checks to pass).

## Usage

The Action supports three run triggers:

- `check_suite` (works only on the default branch).
- `pull_request_target` for all branches.
- `workflow_run` for all branches.

When using the Merge Me! Action, ensure security of your workflows. GitHub
Security Lab provides more
[detailed](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/)
overview of these risks involved in using `pull_request_target` and
`workflow_run` triggers, as well as recommendations on how to avoid these risks.

Recommended setup differs between public and private repositories, however the
Action can be used in other combinations as well.

### Public repositories

Using a `workflow_run` trigger allows to provide the Merge Me! Action with
necessary credentials, while allowing the CI to keep using `pull_request`
trigger, which is safer than `pull_request_target`.

Create a new `.github/workflows/merge-me.yaml` file:

```yaml
name: Merge me!

on:
  workflow_run:
    types:
      - completed
    workflows:
      # List all required workflow names here.
      - 'Continuous Integration'

jobs:
  merge-me:
    name: Merge me!
    runs-on: ubuntu-latest
    steps:
      - # It is often a desired behavior to merge only when a workflow execution
        # succeeds. This can be changed as needed.
        if: ${{ github.event.workflow_run.conclusion == 'success' }}
        name: Merge me!
        uses: ridedott/merge-me-action@v2
        with:
          # Depending on branch protection rules, a  manually populated
          # `GITHUB_TOKEN_WORKAROUND` secret with permissions to push to
          # a protected branch must be used. This secret can have an arbitrary
          # name, as an example, this repository uses `DOTTBOTT_TOKEN`.
          #
          # When using a custom token, it is recommended to leave the following
          # comment for other developers to be aware of the reasoning behind it:
          #
          # This must be used as GitHub Actions token does not support pushing
          # to protected branches.
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Triggering on `check_suite` is similar:

```yaml
name: Merge me!

on:
  check_suite:
    types:
      - completed

jobs:
  merge-me:
    name: Merge me!
    runs-on: ubuntu-latest
    steps:
      - name: Merge me!
        uses: ridedott/merge-me-action@v2
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Private repositories

Private repositories are less prone attacks, as only a restricted set of
accounts has access to them. At the same time, CIs in private repositories often
require access to secrets for other purposes as well, such as installing private
dependencies. For these reasons, it is recommended to use `pull_request_target`
trigger, which allows to combine regular CI checks and the Merge Me! Action into
one workflow:

```yaml
name: Continuous Integration

on:
  # Trigger on Pull Requests against the master branch.
  pull_request_target:
    branches:
      - master
    types:
      - opened
      - synchronize
  # Trigger on Pull Requests to the master branch.
  push:
    branches:
      - master

jobs:
  # Add other CI jobs, such as testing and linting. The example test job
  # showcases checkout settings which support `pull_request_target` and `push`
  # triggers at the same time.
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v2
        with:
          # This adds support for both `pull_request_target` and `push` events.
          ref: ${{ github.event.pull_request.head.sha || github.sha }}
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: 16
          registry-url: https://npm.pkg.github.com
      - # This allows private dependencies from GitHub Packages to be installed.
        # Depending on the setup, it might be required to use a personal access
        # token instead.
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        name: Install dependencies
        run: npm ci --ignore-scripts --no-audit --no-progress
      - name: Test
        run: npm run test
  merge-me:
    name: Merge me!
    needs:
      # List all required job names here.
      - test
    runs-on: ubuntu-latest
    steps:
      - name: Merge me!
        uses: ridedott/merge-me-action@v2
        with:
          # Depending on branch protection rules, a  manually populated
          # `GITHUB_TOKEN_WORKAROUND` secret with permissions to push to
          # a protected branch must be used. This secret can have an arbitrary
          # name, as an example, this repository uses `DOTTBOTT_TOKEN`.
          #
          # When using a custom token, it is recommended to leave the following
          # comment for other developers to be aware of the reasoning behind it:
          #
          # This must be used as GitHub Actions token does not support pushing
          # to protected branches.
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    timeout-minutes: 5
```

## Configuration

### Enable auto-merge for a different bot

You may have another bot that also creates PRs against your repository and you
want to automatically merge those. By default, this GitHub Action assumes the
bot is [`dependabot`](https://github.com/dependabot). You can override the bot
name by changing the value of `GITHUB_LOGIN` parameter:

```yaml
jobs:
  merge-me:
    steps:
      - name: Merge me!
        uses: ridedott/merge-me-action@v2
        with:
          GITHUB_LOGIN: my-awesome-bot-r2d2
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

A common scenario is to use Dependabot Preview (consider updating instead):

```yaml
jobs:
  merge-me:
    steps:
      - name: Merge me!
        uses: ridedott/merge-me-action@v2
        with:
          GITHUB_LOGIN: dependabot-preview
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`GITHUB_LOGIN` option supports
[micromatch](https://github.com/micromatch/micromatch).

### Opting in for GitHub merge info preview API

You may opt-in for using GitHub merge info preview API, which enables the action
to respect strict branch protection rules configured for the repository
(`Require status checks to pass before merging` and
`Require branches to be up to date before merging` options).

```yaml
jobs:
  merge-me:
    steps:
      - name: Merge me!
        uses: ridedott/merge-me-action@v2
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_PREVIEW_API: true
```

### Use of configurable pull request merge method

By default, this GitHub Action assumes merge method is `SQUASH`. You can
override the merge method by changing the value of `MERGE_METHOD` parameter (one
of `MERGE`, `SQUASH` or `REBASE`):

```yaml
jobs:
  merge-me:
    steps:
      - name: Merge me!
        uses: ridedott/merge-me-action@v2
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          MERGE_METHOD: MERGE
```

### Presets

Presets enable additional functionality which can be used to better personalize
default behavior of the Merge me! Action.

Available presets are:

- `DEPENDABOT_MINOR` - Merge only minor and patch dependency updates for pull
  requests created by Dependabot if the dependency version follows
  [Semantic Versioning v2](https://semver.org/).
- `DEPENDABOT_PATCH` - Merge only patch dependency updates for pull requests
  created by Dependabot if the dependency version follows
  [Semantic Versioning v2](https://semver.org/).

```yaml
jobs:
  merge-me:
    steps:
      - name: Merge me!
        uses: ridedott/merge-me-action@v2
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          PRESET: DEPENDABOT_PATCH
```

### Number of retries

In case the merge action fails, by default it will automatically be retried up
to three times using an exponential backoff strategy. This means, the first
retry will happen 1 second after the first failure, while the second will happen
4 seconds after the previous, the third 9 seconds, and so on.

It's possible to configure the number of retries by providing a value for
`MAXIMUM_RETRIES` (by default, the value is `3`).

```yaml
jobs:
  merge-me:
    steps:
      - name: Merge me!
        uses: ridedott/merge-me-action@v2
        with:
          MAXIMUM_RETRIES: 2
```

### Enable for manual changes

There are cases in which manual changes are needed, for instance, in order to
make the CI pass or to solve some conflicts that Dependabot (or the bot you are
using) cannot handle. By default, this GitHub action will skip this case where
the author is not [`dependabot`](https://github.com/dependabot) (or the bot you
are using). This is often desirable as the author might prefer to get a code
review before merging the changes. For this, it checks whether all commits were
made by the original author and that the commit signature is valid.

It is possible to override this default behavior by setting the value of
`ENABLED_FOR_MANUAL_CHANGES` to `'true'`.

```yaml
jobs:
  merge-me:
    steps:
      - name: Merge me!
        uses: ridedott/merge-me-action@v2
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          ENABLED_FOR_MANUAL_CHANGES: 'true'
```

> Important: Please note the single quotes around `true`.

## Getting Started

These instructions will get you a copy of the project up and running on your
local machine for development and testing purposes. See usage notes on how to
consume this package in your project.

### Prerequisites

Minimal requirements to set up the project:

- [Node.js](https://nodejs.org/en) v12, installation instructions can be found
  on the official website, a recommended installation option is to use
  [Node Version Manager](https://github.com/creationix/nvm#readme). It can be
  installed in a
  [few commands](https://nodejs.org/en/download/package-manager/#nvm).
- A package manager [npm](https://www.npmjs.com). All instructions in the
  documentation will follow the npm syntax.
- Optionally a [Git](https://git-scm.com) client.

### Installing

Start by cloning the repository:

```bash
git clone git@github.com:ridedott/merge-me-action.git
```

In case you don't have a git client, you can get the latest version directly by
using
[this link](https://github.com/ridedott/merge-me-action/archive/master.zip) and
extracting the downloaded archive.

Go the the right directory and install dependencies:

```bash
cd merge-me-action
npm install
```

That's it! You can now go to the next step.

## Testing

All tests are being executed using [Jest](https://jestjs.io). All tests files
live side-to-side with a source code and have a common suffix: `.spec.ts`. Some
helper methods are being stored in the `test` directory.

There are three helper scripts to run tests in the most common scenarios:

```bash
npm run test
npm run test:watch
npm run test:coverage
```

## Formatting

This project uses [Prettier](https://prettier.io) to automate formatting. All
supported files are being reformatted in a pre-commit hook. You can also use one
of the two scripts to validate and optionally fix all of the files:

```bash
npm run format
npm run format:fix
```

## Linting

This project uses [ESLint](https://eslint.org) to enable static analysis.
TypeScript files are linted using a [custom configuration](./.eslintrc). You can
use one of the following scripts to validate and optionally fix all of the
files:

```bash
npm run lint
npm run lint:fix
```

## Publishing

Publishing is handled in an automated way and must not be performed manually.

Each commit to the master branch is automatically tagged using
[`semantic-release`](https://github.com/semantic-release/semantic-release).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Built with

### Automation

- [Dependabot](https://dependabot.com/)
- [GitHub Actions](https://github.com/features/actions)

### Source

- [TypeScript](https://www.typescriptlang.org)

## Versioning

This project adheres to [Semantic Versioning](http://semver.org) v2.
