/**
 * @webhook-pragma pull_request
 */

import * as core from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { StatusCodes } from 'http-status-codes';
import * as nock from 'nock';

import {
  approveAndMergePullRequestMutation,
  useSetTimeoutImmediateInvocation,
} from '../../../test/utilities';
import {
  FindPullRequestCommitsResponse,
  FindPullRequestInfoByNumberResponse,
} from '../../types';
import { AllowedMergeMethods } from '../../utilities/inputParsers';
import { pullRequestHandle } from '.';

/* cspell:disable-next-line */
const PULL_REQUEST_ID = 'MDExOlB1bGxSZXF1ZXN0MzE3MDI5MjU4';
const PULL_REQUEST_NUMBER = 1234;
const COMMIT_HEADLINE = 'Update test';
const COMMIT_MESSAGE =
  'Update test\n\nSigned-off-by:dependabot[bot]<support@dependabot.com>';
const DEPENDABOT_GITHUB_LOGIN = 'dependabot';

const octokit = getOctokit('SECRET_GITHUB_TOKEN');
const infoSpy = jest.spyOn(core, 'info').mockImplementation();
const warningSpy = jest.spyOn(core, 'warning').mockImplementation();
const getInputSpy = jest.spyOn(core, 'getInput').mockImplementation();

jest.spyOn(core, 'info').mockImplementation();

interface Response {
  data: FindPullRequestInfoByNumberResponse;
}

interface CommitsResponse {
  data: FindPullRequestCommitsResponse;
}

const branchProtectionRulesResponse = {
  data: {
    repository: {
      branchProtectionRules: {
        edges: [],
        pageInfo: { endCursor: '', hasNextPage: false },
      },
    },
  },
};

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

describe('pull request event handler', (): void => {
  it('does nothing if pullRequest is undefined', async (): Promise<void> => {
    expect.assertions(0);

    const { pull_request: pullRequest } = context.payload;
    delete context.payload.pull_request;

    await pullRequestHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 2);

    /* eslint-disable require-atomic-updates */
    /* eslint-disable immutable/no-mutation */
    context.payload.pull_request = pullRequest;
    /* eslint-enable require-atomic-updates */
    /* eslint-enable immutable/no-mutation */
  });

  it('logs a warning when it cannot find pull request ID by pull request number (null)', async (): Promise<void> => {
    expect.assertions(1);

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, branchProtectionRulesResponse)
      .post('/graphql')
      .reply(StatusCodes.OK, { data: null });

    await pullRequestHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);

    expect(warningSpy).toHaveBeenCalledWith(
      'Unable to fetch pull request information.',
    );
  });

  it('logs a warning when it cannot find pull request ID by pull request number', async (): Promise<void> => {
    expect.assertions(1);

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, branchProtectionRulesResponse)
      .post('/graphql')
      .reply(StatusCodes.OK, { data: { repository: { pullRequest: null } } });

    await pullRequestHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);

    expect(warningSpy).toHaveBeenCalledWith(
      'Unable to fetch pull request information.',
    );
  });

  it('does not merge if request not created by the selected GITHUB_LOGIN and logs it', async (): Promise<void> => {
    expect.assertions(1);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
            base: {
              // eslint-disable-next-line unicorn/prevent-abbreviations
              ref: 'master',
            },
            commits: {
              edges: [
                {
                  node: {
                    commit: {
                      message: COMMIT_MESSAGE,
                      messageHeadline: COMMIT_HEADLINE,
                    },
                  },
                },
              ],
            },
            id: PULL_REQUEST_ID,
            mergeable: 'MERGEABLE',
            merged: false,
            number: PULL_REQUEST_NUMBER,
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'CLOSED',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, branchProtectionRulesResponse)
      .post('/graphql')
      .reply(StatusCodes.OK, response);

    await pullRequestHandle(octokit, 'some-other-login', 3);

    expect(infoSpy).toHaveBeenCalledWith(
      'Pull request #1234 created by dependabot, not some-other-login, skipping.',
    );
  });

  it('retries, approves and merges a pull request', async (): Promise<void> => {
    expect.assertions(0);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
            base: {
              // eslint-disable-next-line unicorn/prevent-abbreviations
              ref: 'master',
            },
            commits: {
              edges: [
                {
                  node: {
                    commit: {
                      message: COMMIT_MESSAGE,
                      messageHeadline: COMMIT_HEADLINE,
                    },
                  },
                },
              ],
            },
            id: PULL_REQUEST_ID,
            mergeable: 'MERGEABLE',
            merged: false,
            number: PULL_REQUEST_NUMBER,
            reviews: { edges: [] },
            state: 'OPEN',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, branchProtectionRulesResponse)
      .post('/graphql')
      .reply(StatusCodes.OK, response)
      .post('/graphql')
      .reply(StatusCodes.OK, validCommitResponse)
      .post('/graphql')
      .times(2)
      .reply(
        403,
        '##[error]GraphqlError: Base branch was modified. Review and try the merge again.',
      )
      .post('/graphql', {
        query: approveAndMergePullRequestMutation(AllowedMergeMethods.SQUASH),
        variables: {
          commitHeadline: COMMIT_HEADLINE,
          pullRequestId: PULL_REQUEST_ID,
        },
      })
      .reply(StatusCodes.OK);

    useSetTimeoutImmediateInvocation();

    await pullRequestHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);
  });
});
