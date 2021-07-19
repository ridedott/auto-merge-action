import { getInput } from '@actions/core';
import { getOctokit } from '@actions/github';

import { PullRequestCommitNode, PullRequestInformation } from '../types';
import {
  AllowedMergeMethods,
  parseInputMergeMethod,
} from '../utilities/inputParsers';
import { logDebug, logInfo, logWarning } from '../utilities/log';
import { checkPullRequestTitleForMergePreset } from '../utilities/prTitleParsers';
import { delay, EXPONENTIAL_BACKOFF, MINIMUM_WAIT_TIME } from './delay';
import { getPullRequestCommitsIterator } from './getPullRequestCommits';

export interface PullRequestDetails {
  commitHeadline: string;
  pullRequestId: string;
  reviewEdge: { node: { state: string } } | undefined;
}

const approveAndMergePullRequestMutation = (
  mergeMethod: AllowedMergeMethods,
): string => `
  mutation ($commitHeadline: String!, $pullRequestId: ID!) {
    addPullRequestReview(input: {event: APPROVE, pullRequestId: $pullRequestId}) {
      clientMutationId
    }
    mergePullRequest(input: {commitBody: " ", commitHeadline: $commitHeadline, mergeMethod: ${mergeMethod}, pullRequestId: $pullRequestId}) {
      clientMutationId
    }
  }
`;

const mergePullRequestMutation = (mergeMethod: AllowedMergeMethods): string => `
  mutation ($commitHeadline: String!, $pullRequestId: ID!) {
    mergePullRequest(input: {commitBody: " ", commitHeadline: $commitHeadline, mergeMethod: ${mergeMethod}, pullRequestId: $pullRequestId}) {
      clientMutationId
    }
  }
`;

const getIsModified = async (
  octokit: ReturnType<typeof getOctokit>,
  query: {
    pullRequestNumber: number;
    repositoryName: string;
    repositoryOwner: string;
  },
): Promise<boolean> => {
  const iterator = getPullRequestCommitsIterator(octokit, query);

  const firstResult: IteratorResult<PullRequestCommitNode> = await iterator.next();

  if (firstResult.done === true) {
    logWarning('Could not find PR commits, aborting.');

    return true;
  }

  for await (const commitNode of iterator) {
    const { author, signature } = commitNode.commit;

    if (signature === null || signature.isValid !== true) {
      logWarning(
        'Commit signature not present or invalid, regarding PR as modified.',
      );

      return true;
    }

    if (author.user.login !== firstResult.value.commit.author.user.login) {
      return true;
    }
  }

  return false;
};

/**
 * Approves and merges a given Pull Request.
 */
const merge = async (
  octokit: ReturnType<typeof getOctokit>,
  pullRequestDetails: PullRequestDetails,
): Promise<void> => {
  const mergeMethod = parseInputMergeMethod();

  const { commitHeadline, pullRequestId, reviewEdge } = pullRequestDetails;

  const mutation =
    reviewEdge === undefined
      ? approveAndMergePullRequestMutation(mergeMethod)
      : mergePullRequestMutation(mergeMethod);

  await octokit.graphql(mutation, { commitHeadline, pullRequestId });
};

const shouldRetry = (
  error: Error,
  retryCount: number,
  maximumRetries: number,
): boolean => {
  const isRetryableError = error.message.includes('Base branch was modified.');

  if (isRetryableError && retryCount > maximumRetries) {
    logInfo(
      `Unable to merge after ${retryCount.toString()} attempts. Retries exhausted.`,
    );

    return false;
  }

  return isRetryableError;
};

const mergeWithRetry = async (
  octokit: ReturnType<typeof getOctokit>,
  details: PullRequestDetails & {
    maximumRetries: number;
    retryCount: number;
  },
): Promise<void> => {
  const { retryCount, maximumRetries } = details;

  try {
    await merge(octokit, details);
  } catch (error: unknown) {
    if (shouldRetry(error as Error, retryCount, maximumRetries)) {
      const nextRetryIn = retryCount ** EXPONENTIAL_BACKOFF * MINIMUM_WAIT_TIME;

      logInfo(`Retrying in ${nextRetryIn.toString()}...`);

      await delay(nextRetryIn);

      await mergeWithRetry(octokit, {
        ...details,
        maximumRetries,
        retryCount: retryCount + 1,
      });

      return;
    }

    logInfo(
      'An error ocurred while merging the Pull Request. This is usually ' +
        'caused by the base branch being out of sync with the target ' +
        'branch. In this case, the base branch must be rebased. Some ' +
        'tools, such as Dependabot, do that automatically.',
    );
    /* eslint-disable-next-line @typescript-eslint/no-base-to-string */
    logDebug(`Original error: ${(error as Error).toString()}.`);
  }
};

export const tryMerge = async (
  octokit: ReturnType<typeof getOctokit>,
  {
    maximumRetries,
    requiresStrictStatusChecks,
  }: {
    maximumRetries: number;
    requiresStrictStatusChecks: boolean;
  },
  {
    commitMessageHeadline,
    mergeableState,
    mergeStateStatus,
    merged,
    pullRequestId,
    pullRequestNumber,
    pullRequestState,
    pullRequestTitle,
    reviewEdges,
    repositoryName,
    repositoryOwner,
  }: PullRequestInformation,
): Promise<void> => {
  const allowedAuthorName = getInput('GITHUB_LOGIN');
  const enabledForManualChanges =
    getInput('ENABLED_FOR_MANUAL_CHANGES') === 'true';

  if (mergeableState !== 'MERGEABLE') {
    logInfo(`Pull request is not in a mergeable state: ${mergeableState}.`);
  } else if (merged) {
    logInfo(`Pull request is already merged.`);
  } else if (
    requiresStrictStatusChecks === true &&
    mergeStateStatus === 'BEHIND'
  ) {
    logInfo(`Pull request branch is behind base branch.`);
  } else if (mergeStateStatus !== undefined && mergeStateStatus !== 'CLEAN') {
    logInfo(
      `Pull request cannot be merged cleanly. Current state: ${
        mergeStateStatus as string
      }.`,
    );
  } else if (pullRequestState !== 'OPEN') {
    logInfo(`Pull request is not open: ${pullRequestState}.`);
  } else if (checkPullRequestTitleForMergePreset(pullRequestTitle) === false) {
    logInfo(`Pull request version bump is not allowed by PRESET.`);
  } else if (
    enabledForManualChanges === false &&
    (await getIsModified(octokit, {
      pullRequestNumber,
      repositoryName,
      repositoryOwner,
    })) === true
  ) {
    logInfo(`Pull request changes were not made by ${allowedAuthorName}.`);
  } else {
    await mergeWithRetry(octokit, {
      commitHeadline: commitMessageHeadline,
      maximumRetries,
      pullRequestId,
      retryCount: 1,
      reviewEdge: reviewEdges[0],
    });
  }
};
