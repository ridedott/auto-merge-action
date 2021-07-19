/**
 * @webhook-pragma check_suite
 */

import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { StatusCodes } from 'http-status-codes';
import * as nock from 'nock';

import {
  mergePullRequestMutation,
  useSetTimeoutImmediateInvocation,
} from '../../test/utilities';
import {
  FindPullRequestCommitsResponse,
  PullRequestInformation,
} from '../types';
import { AllowedMergeMethods } from '../utilities/inputParsers';
import { tryMerge } from './merge';

/* cspell:disable-next-line */
const PULL_REQUEST_ID = 'MDExOlB1bGxSZXF1ZXN0MzE3MDI5MjU4';
const PULL_REQUEST_NUMBER = 1234;
const COMMIT_HEADLINE = 'Update test';
const COMMIT_MESSAGE =
  'Update test\n\nSigned-off-by:dependabot[bot]<support@dependabot.com>';
const DEPENDABOT_GITHUB_LOGIN = 'dependabot';
const REPOSITORY_NAME = 'Test-Repo';
const REPOSITORY_OWNER = 'test-actor';

const octokit = getOctokit('SECRET_GITHUB_TOKEN');
const infoSpy = jest.spyOn(core, 'info').mockImplementation();
const warningSpy = jest.spyOn(core, 'warning').mockImplementation();
const debugSpy = jest.spyOn(core, 'debug').mockImplementation();
const getInputSpy = jest.spyOn(core, 'getInput').mockImplementation();

interface CommitsResponse {
  data: FindPullRequestCommitsResponse;
}

const validCommitResponse: CommitsResponse = {
  data: {
    repository: {
      pullRequest: {
        commits: {
          edges: [
            {
              node: {
                commit: {
                  author: {
                    user: {
                      login: 'dependabot',
                    },
                  },
                  signature: {
                    isValid: true,
                  },
                },
              },
            },
          ],
          pageInfo: {
            endCursor: '',
            hasNextPage: false,
          },
        },
      },
    },
  },
};

beforeEach((): void => {
  getInputSpy.mockImplementation((name: string): string => {
    if (name === 'GITHUB_LOGIN') {
      return DEPENDABOT_GITHUB_LOGIN;
    }

    if (name === 'MERGE_METHOD') {
      return 'SQUASH';
    }

    if (name === 'PRESET') {
      return 'DEPENDABOT_MINOR';
    }

    return '';
  });
});

describe('merge', (): void => {
  it('does not log warnings when it gets triggered by Dependabot', async (): Promise<void> => {
    expect.assertions(1);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [],
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, validCommitResponse);
    nock('https://api.github.com').post('/graphql').reply(StatusCodes.OK);

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );

    expect(warningSpy).not.toHaveBeenCalled();
  });

  it('does not approve an already approved pull request', async (): Promise<void> => {
    expect.assertions(0);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, validCommitResponse)
      .post('/graphql', {
        query: mergePullRequestMutation(AllowedMergeMethods.SQUASH),
        variables: {
          commitHeadline: COMMIT_HEADLINE,
          pullRequestId: PULL_REQUEST_ID,
        },
      })
      .reply(StatusCodes.OK);

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );
  });

  it('does not approve pull requests that are not mergeable', async (): Promise<void> => {
    expect.assertions(1);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeableState: 'CONFLICTING',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );

    expect(infoSpy).toHaveBeenCalledWith(
      'Pull request is not in a mergeable state: CONFLICTING.',
    );
  });

  it('does not approve pull requests that are already merged', async (): Promise<void> => {
    expect.assertions(1);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeableState: 'MERGEABLE',
      merged: true,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );

    expect(infoSpy).toHaveBeenCalledWith('Pull request is already merged.');
  });

  it('does not approve pull requests for which status is BEHIND when requiresStrictStatusChecks is set to true', async (): Promise<void> => {
    expect.assertions(1);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeStateStatus: 'BEHIND',
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: true },
      pullRequestInformation,
    );

    expect(infoSpy).toHaveBeenCalledWith(
      'Pull request branch is behind base branch.',
    );
  });

  it('does not approve pull requests for which status is not CLEAN when requiresStrictStatusChecks is set to true', async (): Promise<void> => {
    expect.assertions(1);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeStateStatus: 'DIRTY',
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: true },
      pullRequestInformation,
    );

    expect(infoSpy).toHaveBeenCalledWith(
      'Pull request cannot be merged cleanly. Current state: DIRTY.',
    );
  });

  it('approves and merges pull requests for which status is CLEAN when requiresStrictStatusChecks is set to true', async (): Promise<void> => {
    expect.assertions(0);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeStateStatus: 'CLEAN',
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, validCommitResponse)
      .post('/graphql')
      .reply(StatusCodes.OK);

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: true },
      pullRequestInformation,
    );
  });

  it('does not approve pull requests for which status is not clean', async (): Promise<void> => {
    expect.assertions(1);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeStateStatus: 'UNKNOWN',
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: true },
      pullRequestInformation,
    );

    expect(infoSpy).toHaveBeenCalledWith(
      'Pull request cannot be merged cleanly. Current state: UNKNOWN.',
    );
  });

  it('does not approve pull requests for which state is not open', async (): Promise<void> => {
    expect.assertions(1);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'CLOSED',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );

    expect(infoSpy).toHaveBeenCalledWith('Pull request is not open: CLOSED.');
  });

  it('approves pull request and merges it', async (): Promise<void> => {
    expect.assertions(0);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeStateStatus: 'CLEAN',
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [],
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, validCommitResponse)
      .post('/graphql')
      .reply(StatusCodes.OK);

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );
  });

  it('does not merge if a commit was not created by the original author and ENABLED_FOR_MANUAL_CHANGES is not set to "true"', async (): Promise<void> => {
    expect.assertions(1);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    const commitsResponse: CommitsResponse = {
      data: {
        repository: {
          pullRequest: {
            commits: {
              edges: [
                {
                  node: {
                    commit: {
                      author: {
                        user: {
                          login: 'dependabot',
                        },
                      },
                      signature: {
                        isValid: true,
                      },
                    },
                  },
                },
                {
                  node: {
                    commit: {
                      author: {
                        user: {
                          login: 'dependabot',
                        },
                      },
                      signature: {
                        isValid: true,
                      },
                    },
                  },
                },
                {
                  node: {
                    commit: {
                      author: {
                        user: {
                          login: 'not-dependabot',
                        },
                      },
                      signature: {
                        isValid: true,
                      },
                    },
                  },
                },
              ],
              pageInfo: {
                endCursor: '',
                hasNextPage: false,
              },
            },
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, commitsResponse);

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );

    expect(infoSpy).toHaveBeenCalledWith(
      `Pull request changes were not made by ${DEPENDABOT_GITHUB_LOGIN}.`,
    );
  });

  it('does not merge if a commit signature is not valid and ENABLED_FOR_MANUAL_CHANGES is not set to "true"', async (): Promise<void> => {
    expect.assertions(1);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    const commitsResponse: CommitsResponse = {
      data: {
        repository: {
          pullRequest: {
            commits: {
              edges: [
                {
                  node: {
                    commit: {
                      author: {
                        user: {
                          login: 'dependabot',
                        },
                      },
                      signature: {
                        isValid: true,
                      },
                    },
                  },
                },
                {
                  node: {
                    commit: {
                      author: {
                        user: {
                          login: 'dependabot',
                        },
                      },
                      signature: {
                        isValid: false,
                      },
                    },
                  },
                },
              ],
              pageInfo: {
                endCursor: '',
                hasNextPage: false,
              },
            },
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, commitsResponse);

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );

    expect(warningSpy).toHaveBeenCalledWith(
      'Commit signature not present or invalid, regarding PR as modified.',
    );
  });

  it('does not log any warnings if last commit was not created by the selected GITHUB_LOGIN and ENABLED_FOR_MANUAL_CHANGES is set to "true"', async (): Promise<void> => {
    expect.assertions(1);

    getInputSpy.mockImplementation((name: string): string => {
      if (name === 'ENABLED_FOR_MANUAL_CHANGES') {
        return 'true';
      }

      if (name === 'GITHUB_LOGIN') {
        return DEPENDABOT_GITHUB_LOGIN;
      }

      if (name === 'MERGE_METHOD') {
        return 'SQUASH';
      }

      if (name === 'PRESET') {
        return 'DEPENDABOT_MINOR';
      }

      return '';
    });

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    const commitsResponse: CommitsResponse = {
      data: {
        repository: {
          pullRequest: {
            commits: {
              edges: [
                {
                  node: {
                    commit: {
                      author: {
                        user: {
                          login: 'dependabot',
                        },
                      },
                      signature: {
                        isValid: true,
                      },
                    },
                  },
                },
                {
                  node: {
                    commit: {
                      author: {
                        user: {
                          login: 'not-dependabot',
                        },
                      },
                      signature: {
                        isValid: true,
                      },
                    },
                  },
                },
              ],
              pageInfo: {
                endCursor: '',
                hasNextPage: false,
              },
            },
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, commitsResponse);

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );

    expect(infoSpy).not.toHaveBeenCalledWith(
      `Pull request changes were not made by ${DEPENDABOT_GITHUB_LOGIN}.`,
    );
  });

  it('logs a warning if it cannot find the PR commits', async (): Promise<void> => {
    expect.assertions(1);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    const commitsResponse = {
      data: {
        repository: {},
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, commitsResponse);

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );

    expect(warningSpy).toHaveBeenCalledWith(
      'Could not find PR commits, aborting.',
    );
  });

  it('retries up to two times before failing', async (): Promise<void> => {
    expect.assertions(5);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, validCommitResponse)
      .post('/graphql')
      .times(3)
      .reply(
        403,
        '##[error]GraphqlError: Base branch was modified. Review and try the merge again.',
      );

    useSetTimeoutImmediateInvocation();

    await tryMerge(
      octokit,
      { maximumRetries: 2, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );

    expect(infoSpy).toHaveBeenCalledWith(
      'An error ocurred while merging the Pull Request. This is usually caused by the base branch being out of sync with the target branch. In this case, the base branch must be rebased. Some tools, such as Dependabot, do that automatically.',
    );
    expect(infoSpy).toHaveBeenCalledWith('Retrying in 1000...');
    expect(infoSpy).toHaveBeenCalledWith('Retrying in 4000...');
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith(
      'Original error: HttpError: ##[error]GraphqlError: Base branch was modified. Review and try the merge again..',
    );
  });

  it('fails the backoff strategy when the error is not "Base branch was modified"', async (): Promise<void> => {
    expect.assertions(2);

    const pullRequestInformation: PullRequestInformation = {
      authorLogin: 'dependabot',
      commitMessage: COMMIT_MESSAGE,
      commitMessageHeadline: COMMIT_HEADLINE,
      mergeableState: 'MERGEABLE',
      merged: false,
      pullRequestId: PULL_REQUEST_ID,
      pullRequestNumber: PULL_REQUEST_NUMBER,
      pullRequestState: 'OPEN',
      pullRequestTitle: 'bump @types/jest from 26.0.12 to 26.1.0',
      repositoryName: REPOSITORY_NAME,
      repositoryOwner: REPOSITORY_OWNER,
      reviewEdges: [{ node: { state: 'APPROVED' } }],
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, validCommitResponse)
      .post('/graphql')
      .reply(403, '##[error]GraphqlError: This is a different error.');

    await tryMerge(
      octokit,
      { maximumRetries: 3, requiresStrictStatusChecks: false },
      pullRequestInformation,
    );

    expect(infoSpy).toHaveBeenCalledWith(
      'An error ocurred while merging the Pull Request. This is usually caused by the base branch being out of sync with the target branch. In this case, the base branch must be rebased. Some tools, such as Dependabot, do that automatically.',
    );
    expect(debugSpy).toHaveBeenCalledWith(
      'Original error: HttpError: ##[error]GraphqlError: This is a different error..',
    );
  });

  describe('for a dependabot initiated pull request', (): void => {
    it('does nothing if the PR title contains a major bump but PRESET specifies DEPENDABOT_PATCH', async (): Promise<void> => {
      expect.assertions(0);

      const pullRequestInformation: PullRequestInformation = {
        authorLogin: 'dependabot',
        commitMessage: COMMIT_MESSAGE,
        commitMessageHeadline: COMMIT_HEADLINE,
        mergeableState: 'MERGEABLE',
        merged: false,
        pullRequestId: PULL_REQUEST_ID,
        pullRequestNumber: PULL_REQUEST_NUMBER,
        pullRequestState: 'OPEN',
        pullRequestTitle: 'bump @types/jest from 26.0.12 to 27.0.13',
        repositoryName: REPOSITORY_NAME,
        repositoryOwner: REPOSITORY_OWNER,
        reviewEdges: [],
      };

      await tryMerge(
        octokit,
        { maximumRetries: 3, requiresStrictStatusChecks: true },
        pullRequestInformation,
      );
    });
  });
});
