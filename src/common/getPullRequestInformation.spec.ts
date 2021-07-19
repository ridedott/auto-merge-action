/* cspell:ignore reqheaders */

import { getOctokit } from '@actions/github';
import { StatusCodes } from 'http-status-codes';
import * as nock from 'nock';

import {
  MergeableState,
  MergeStateStatus,
  PullRequestState,
  ReviewEdges,
} from '../types';
import { getMergeablePullRequestInformationByPullRequestNumber } from './getPullRequestInformation';

/**
 * Test utilities
 */
const octokit = getOctokit('SECRET_GITHUB_TOKEN');
const repositoryName = 'test-repository';
const repositoryOwner = 'test-owner';
const pullRequestNumber = 1;

const pullRequestFields = (mergeInfoPreviewEnabled: boolean): string => {
  const fields = [
    `author {
       login
    }`,
    `commits(last: 1) {
      edges {
        node {
          commit {
            author {
              name
            }
            messageHeadline
            message
          }
        }
      }
    }`,
    'id',
    'mergeable',
    'merged',
    ...(mergeInfoPreviewEnabled ? ['mergeStateStatus'] : []),
    'number',
    `reviews(last: 1, states: APPROVED) {
      edges {
        node {
          state
        }
      }
    }`,
    'state',
    'title',
  ];

  return `{
    ${fields.join('\n')}
  }`;
};

const findPullRequestInfoByNumberQuery = (
  mergeInfoPreviewEnabled: boolean,
): string => `
  query FindPullRequestInfoByNumber(
    $repositoryOwner: String!,
    $repositoryName: String!,
    $pullRequestNumber: Int!
  ) {
    repository(owner: $repositoryOwner, name: $repositoryName) {
      pullRequest(number: $pullRequestNumber) ${pullRequestFields(
        mergeInfoPreviewEnabled,
      )}
    }
  }
`;

interface GraphQLResponse {
  repository: {
    pullRequest: {
      author: {
        login: string;
      };
      commits: {
        edges: Array<{
          node: {
            commit: {
              author: {
                name: string;
              };
              message: string;
              messageHeadline: string;
            };
          };
        }>;
      };
      id: string;
      mergeStateStatus?: MergeStateStatus;
      mergeable: MergeableState;
      merged: boolean;
      number: number;
      reviews: {
        edges: ReviewEdges[];
      };
      state: PullRequestState;
      title: string;
    };
  };
}

const makeGraphQLResponse = (
  includeMergeStateStatus: boolean,
): GraphQLResponse => ({
  repository: {
    pullRequest: {
      author: {
        login: 'test-author',
      },
      commits: {
        edges: [
          {
            node: {
              commit: {
                author: {
                  name: 'Test Author',
                },
                message: 'test message',
                messageHeadline: 'test message headline',
              },
            },
          },
        ],
      },
      id: '123',
      ...(includeMergeStateStatus ? { mergeStateStatus: 'CLEAN' } : {}),
      mergeable: 'MERGEABLE',
      merged: false,
      number: pullRequestNumber,
      reviews: {
        edges: [],
      },
      state: 'OPEN',
      title: 'test',
    },
  },
});

/**
 * Tests
 */
describe('getPullRequestInformation', (): void => {
  it.each<[string, boolean]>([
    ['without mergeStateStatus field', false],
    ['with mergeStateStatus field', true],
  ])(
    'returns pull request information %s',
    async (_: string, mergeInfoPreviewEnabled: boolean): Promise<void> => {
      expect.assertions(1);

      nock('https://api.github.com', {
        reqheaders: {
          accept: mergeInfoPreviewEnabled
            ? 'application/vnd.github.merge-info-preview+json'
            : 'application/vnd.github.v3+json',
        },
      })
        .post('/graphql', {
          query: findPullRequestInfoByNumberQuery(mergeInfoPreviewEnabled),
          variables: {
            pullRequestNumber,
            repositoryName,
            repositoryOwner,
          },
        })
        .reply(StatusCodes.OK, {
          data: makeGraphQLResponse(mergeInfoPreviewEnabled),
        });

      const result = await getMergeablePullRequestInformationByPullRequestNumber(
        octokit,
        {
          pullRequestNumber,
          repositoryName,
          repositoryOwner,
        },
        { mergeInfoPreviewEnabled },
      );

      expect(result).toMatchSnapshot();
    },
  );
});
