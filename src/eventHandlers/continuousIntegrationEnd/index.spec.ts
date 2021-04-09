/**
 * @webhook-pragma check_suite
 */

import * as core from '@actions/core';
import { getOctokit } from '@actions/github';
import { StatusCodes } from 'http-status-codes';
import * as nock from 'nock';

import { useSetTimeoutImmediateInvocation } from '../../../test/utilities';
import { mergePullRequestMutation } from '../../graphql/mutations';
import {
  FindPullRequestCommits,
  FindPullRequestInfoByNumberResponse,
} from '../../types';
import { AllowedMergeMethods } from '../../utilities/inputParsers';
import { continuousIntegrationEndHandle } from '.';

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
const debugSpy = jest.spyOn(core, 'debug').mockImplementation();
const getInputSpy = jest.spyOn(core, 'getInput').mockImplementation();

interface Response {
  data: FindPullRequestInfoByNumberResponse;
}

interface CommitsResponse {
  data: FindPullRequestCommits;
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

describe('continuous integration end event handler', (): void => {
  it('does not log warnings when it gets triggered by Dependabot', async (): Promise<void> => {
    expect.assertions(1);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [] },
            state: 'OPEN',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, response)
      .post('/graphql')
      .reply(StatusCodes.OK, validCommitResponse);
    nock('https://api.github.com').post('/graphql').reply(StatusCodes.OK);

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);

    expect(warningSpy).not.toHaveBeenCalled();
  });

  it('does not approve an already approved pull request', async (): Promise<void> => {
    expect.assertions(0);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'OPEN',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, response)
      .post('/graphql')
      .reply(StatusCodes.OK, validCommitResponse);
    nock('https://api.github.com')
      .post('/graphql', {
        query: mergePullRequestMutation(AllowedMergeMethods.SQUASH),
        variables: {
          commitHeadline: COMMIT_HEADLINE,
          pullRequestId: PULL_REQUEST_ID,
        },
      })
      .reply(StatusCodes.OK);

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);
  });

  it('does not approve pull requests that are not mergeable', async (): Promise<void> => {
    expect.assertions(1);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            mergeable: 'CONFLICTING',
            merged: false,
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'OPEN',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, response);

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);

    expect(infoSpy).toHaveBeenCalledWith(
      'Pull request is not in a mergeable state: CONFLICTING.',
    );
  });

  it('does not approve pull requests that are already merged', async (): Promise<void> => {
    expect.assertions(1);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            merged: true,
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'OPEN',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, response);

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);

    expect(infoSpy).toHaveBeenCalledWith('Pull request is already merged.');
  });

  it('does not approve pull requests for which status is not clean', async (): Promise<void> => {
    expect.assertions(1);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            mergeStateStatus: 'UNKNOWN',
            mergeable: 'MERGEABLE',
            merged: false,
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'OPEN',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, response);

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);

    expect(infoSpy).toHaveBeenCalledWith(
      'Pull request cannot be merged cleanly. Current state: UNKNOWN.',
    );
  });

  it('does not approve pull requests for which state is not open', async (): Promise<void> => {
    expect.assertions(1);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'CLOSED',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, response);

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);

    expect(infoSpy).toHaveBeenCalledWith('Pull request is not open: CLOSED.');
  });

  it('does not merge if request not created by the selected GITHUB_LOGIN and logs it', async (): Promise<void> => {
    expect.assertions(1);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'CLOSED',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, response);

    await continuousIntegrationEndHandle(octokit, 'some-other-login', 3);

    expect(infoSpy).toHaveBeenCalledWith(
      'Pull request created by dependabot, not some-other-login, skipping.',
    );
  });

  it('does not merge if a commit was not created by the original author and ENABLED_FOR_MANUAL_CHANGES is not set to "true"', async (): Promise<void> => {
    expect.assertions(1);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'OPEN',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    const commitsResponse = {
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
      .reply(StatusCodes.OK, response)
      .post('/graphql')
      .reply(StatusCodes.OK, commitsResponse);

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);

    expect(infoSpy).toHaveBeenCalledWith(
      `Pull request changes were not made by ${DEPENDABOT_GITHUB_LOGIN}.`,
    );
  });

  it('does not merge if a commit signature is not valid and ENABLED_FOR_MANUAL_CHANGES is not set to "true"', async (): Promise<void> => {
    expect.assertions(1);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'OPEN',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    const commitsResponse = {
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
      .reply(StatusCodes.OK, response)
      .post('/graphql')
      .reply(StatusCodes.OK, commitsResponse);

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);

    expect(warningSpy).toHaveBeenCalledWith(
      `Commit signature is not valid, assuming PR is modified.`,
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

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'OPEN',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    const commitsResponse = {
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
      .reply(StatusCodes.OK, response)
      .post('/graphql')
      .reply(StatusCodes.OK, commitsResponse);

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);

    expect(infoSpy).not.toHaveBeenCalledWith(
      `Pull request changes were not made by ${DEPENDABOT_GITHUB_LOGIN}.`,
    );
  });

  it('logs a warning when it cannot find pull request ID by pull request number', async (): Promise<void> => {
    expect.assertions(1);

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, { data: { repository: { pullRequest: null } } });

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 3);

    expect(warningSpy).toHaveBeenCalled();
  });

  it('retries up to two times before failing', async (): Promise<void> => {
    expect.assertions(5);

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'OPEN',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, response)
      .post('/graphql')
      .reply(StatusCodes.OK, validCommitResponse)
      .post('/graphql')
      .times(3)
      .reply(
        403,
        '##[error]GraphqlError: Base branch was modified. Review and try the merge again.',
      );

    useSetTimeoutImmediateInvocation();

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 2);

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

    const response: Response = {
      data: {
        repository: {
          pullRequest: {
            author: { login: 'dependabot' },
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
            pullRequest: { number: PULL_REQUEST_NUMBER },
            reviews: { edges: [{ node: { state: 'APPROVED' } }] },
            state: 'OPEN',
            title: 'bump @types/jest from 26.0.12 to 26.1.0',
          },
        },
      },
    };

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, response)
      .post('/graphql')
      .reply(StatusCodes.OK, validCommitResponse)
      .post('/graphql')
      .reply(403, '##[error]GraphqlError: This is a different error.');

    await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 2);

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

      const response: Response = {
        data: {
          repository: {
            pullRequest: {
              author: { login: 'dependabot' },
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
              pullRequest: { number: PULL_REQUEST_NUMBER },
              reviews: { edges: [] },
              state: 'OPEN',
              title: 'bump @types/jest from 26.0.12 to 27.0.13',
            },
          },
        },
      };

      nock('https://api.github.com')
        .post('/graphql')
        .reply(StatusCodes.OK, response);

      await continuousIntegrationEndHandle(octokit, DEPENDABOT_GITHUB_LOGIN, 2);
    });
  });
});
