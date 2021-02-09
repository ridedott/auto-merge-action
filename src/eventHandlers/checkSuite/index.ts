/* eslint-disable no-await-in-loop */

import { context, getOctokit } from '@actions/github';

import { tryMerge } from '../../common/merge';
import { findPullRequestInfoByNumber } from '../../graphql/queries';
import {
  FindPullRequestInfoByNumberResponse,
  PullRequestInformation,
} from '../../types';
import { logInfo, logWarning } from '../../utilities/log';

const getPullRequestInformation = async (
  octokit: ReturnType<typeof getOctokit>,
  query: {
    pullRequestNumber: number;
    repositoryName: string;
    repositoryOwner: string;
  },
): Promise<PullRequestInformation | undefined> => {
  const response = await octokit.graphql(findPullRequestInfoByNumber, query);

  if (response === null || response.repository.pullRequest === null) {
    return undefined;
  }

  const {
    repository: {
      pullRequest: {
        id: pullRequestId,
        commits: {
          edges: [
            {
              node: {
                commit: {
                  author: { name: commitAuthorName },
                  message: commitMessage,
                  messageHeadline: commitMessageHeadline,
                },
              },
            },
          ],
        },
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
    commitAuthorName,
    commitMessage,
    commitMessageHeadline,
    mergeStateStatus,
    mergeableState,
    merged,
    pullRequestId,
    pullRequestState,
    pullRequestTitle,
    reviewEdges,
  };
};

export const checkSuiteHandle = async (
  octokit: ReturnType<typeof getOctokit>,
  gitHubLogin: string,
  maximumRetries: number,
): Promise<void> => {
  const pullRequests = context.payload.check_suite.pull_requests as Array<{
    number: number;
  }>;

  for (const pullRequest of pullRequests) {
    if (
      typeof context.payload.sender !== 'object' ||
      context.payload.sender.login !== gitHubLogin
    ) {
      logInfo(
        `Pull request created by ${
          (context.payload.sender?.login as string | undefined) ??
          'unknown sender'
        }, not ${gitHubLogin}, skipping.`,
      );

      return;
    }

    const pullRequestInformation = await getPullRequestInformation(octokit, {
      pullRequestNumber: pullRequest.number,
      repositoryName: context.repo.repo,
      repositoryOwner: context.repo.owner,
    });

    if (pullRequestInformation === undefined) {
      logWarning('Unable to fetch pull request information.');
    } else {
      logInfo(
        `Found pull request information: ${JSON.stringify(
          pullRequestInformation,
        )}.`,
      );

      await tryMerge(octokit, maximumRetries, pullRequestInformation);
    }
  }
};
