import { getOctokit } from '@actions/github';
import type { GraphQlQueryResponseData } from '@octokit/graphql';

import {
  FindPullRequestInfoByNumberResponse,
  PullRequestInformation,
} from '../types';

const MERGEABLE_STATUS_UNKNOWN_ERROR = 'Mergeable state is not known yet.';

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

const getPullRequestInformationByPullRequestNumber = async (
  octokit: ReturnType<typeof getOctokit>,
  query: {
    pullRequestNumber: number;
    repositoryName: string;
    repositoryOwner: string;
  },
  options: {
    mergeInfoPreviewEnabled: boolean;
  },
): Promise<PullRequestInformation | undefined> => {
  const response = await octokit.graphql<GraphQlQueryResponseData | null>(
    findPullRequestInfoByNumberQuery(options.mergeInfoPreviewEnabled),
    {
      ...query,
      ...(options.mergeInfoPreviewEnabled
        ? {
            mediaType: {
              previews: ['merge-info'],
            },
          }
        : {}),
    },
  );

  if (response === null || response.repository.pullRequest === null) {
    return undefined;
  }

  const {
    repository: {
      pullRequest: {
        author: { login: authorLogin },
        id: pullRequestId,
        commits: {
          edges: [
            {
              node: {
                commit: {
                  message: commitMessage,
                  messageHeadline: commitMessageHeadline,
                },
              },
            },
          ],
        },
        number: pullRequestNumber,
        reviews: { edges: reviewEdges },
        mergeStateStatus,
        mergeable: mergeableState,
        merged,
        state: pullRequestState,
        title: pullRequestTitle,
      },
    },
  } = response as FindPullRequestInfoByNumberResponse;

  return {
    authorLogin,
    commitMessage,
    commitMessageHeadline,
    ...(mergeStateStatus !== undefined ? { mergeStateStatus } : {}),
    mergeableState,
    merged,
    pullRequestId,
    pullRequestNumber,
    pullRequestState,
    pullRequestTitle,
    repositoryName: query.repositoryName,
    repositoryOwner: query.repositoryOwner,
    reviewEdges,
  };
};

export const getMergeablePullRequestInformationByPullRequestNumber = async (
  octokit: ReturnType<typeof getOctokit>,
  query: {
    pullRequestNumber: number;
    repositoryName: string;
    repositoryOwner: string;
  },
  options: {
    mergeInfoPreviewEnabled: boolean;
  },
): Promise<PullRequestInformation | undefined> => {
  const pullRequestInformation = await getPullRequestInformationByPullRequestNumber(
    octokit,
    query,
    options,
  );

  if (pullRequestInformation === undefined) {
    return undefined;
  }

  if (pullRequestInformation.mergeableState === 'UNKNOWN') {
    throw new Error(MERGEABLE_STATUS_UNKNOWN_ERROR);
  }

  return pullRequestInformation;
};
