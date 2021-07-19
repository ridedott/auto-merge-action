import { getInput } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { isMatch } from 'micromatch';

import { computeRequiresStrictStatusChecksForRefs as computeRequiresStrictStatusChecksForReferences } from '../../common/computeRequiresStrictStatusChecksForRefs';
import {
  delay,
  EXPONENTIAL_BACKOFF,
  MINIMUM_WAIT_TIME,
} from '../../common/delay';
import { getMergeablePullRequestInformationByPullRequestNumber } from '../../common/getPullRequestInformation';
import { listBranchProtectionRules } from '../../common/listBranchProtectionRules';
import { tryMerge } from '../../common/merge';
import { PullRequest, PullRequestInformation } from '../../types';
import { logDebug, logInfo, logWarning } from '../../utilities/log';

const getMergeablePullRequestInformationWithRetry = async (
  octokit: ReturnType<typeof getOctokit>,
  query: {
    pullRequestNumber: number;
    repositoryName: string;
    repositoryOwner: string;
  },
  retries: {
    count?: number;
    maximum: number;
  },
): Promise<PullRequestInformation | undefined> => {
  const mergeInfoPreviewEnabled =
    getInput('ENABLE_MERGE_INFO_PREVIEW') === 'true';

  const retryCount = retries.count ?? 1;

  const nextRetryIn = retryCount ** EXPONENTIAL_BACKOFF * MINIMUM_WAIT_TIME;

  try {
    return await getMergeablePullRequestInformationByPullRequestNumber(
      octokit,
      query,
      { mergeInfoPreviewEnabled },
    );
  } catch (error: unknown) {
    logDebug(
      `Failed to get pull request #${query.pullRequestNumber.toString()} information: ${
        (error as Error).message
      }.`,
    );

    if (retryCount < retries.maximum) {
      logDebug(
        `Retrying get pull request #${query.pullRequestNumber.toString()} information in ${nextRetryIn.toString()}...`,
      );

      await delay(nextRetryIn);

      return await getMergeablePullRequestInformationWithRetry(octokit, query, {
        ...retries,
        count: retryCount + 1,
      });
    }

    logDebug(
      `Failed to get pull request #${query.pullRequestNumber.toString()} information after ${retryCount.toString()} attempts. Retries exhausted.`,
    );

    return Promise.reject(error);
  }
};

export const continuousIntegrationEndHandle = async (
  octokit: ReturnType<typeof getOctokit>,
  gitHubLogin: string,
  maximumRetries: number,
): Promise<void> => {
  const pullRequests = (context.eventName === 'workflow_run'
    ? context.payload.workflow_run
    : context.payload.check_suite
  ).pull_requests as PullRequest[];

  const branchProtectionRules = await listBranchProtectionRules(
    octokit,
    context.repo.owner,
    context.repo.repo,
  );

  const requiresStrictStatusChecksArray = computeRequiresStrictStatusChecksForReferences(
    branchProtectionRules,
    pullRequests.map(({ base }: PullRequest): string => base.ref),
  );

  const pullRequestsInformationPromises: Array<
    Promise<PullRequestInformation | undefined>
  > = [];

  for (const pullRequest of pullRequests) {
    pullRequestsInformationPromises.push(
      getMergeablePullRequestInformationWithRetry(
        octokit,
        {
          pullRequestNumber: pullRequest.number,
          repositoryName: context.repo.repo,
          repositoryOwner: context.repo.owner,
        },
        { maximum: maximumRetries },
      ).catch((): undefined => undefined),
    );
  }

  const pullRequestsInformation = await Promise.all(
    pullRequestsInformationPromises,
  );

  const mergePromises: Array<Promise<void>> = [];

  for (const [
    index,
    pullRequestInformation,
  ] of pullRequestsInformation.entries()) {
    if (pullRequestInformation === undefined) {
      logWarning('Unable to fetch pull request information.');
    } else if (isMatch(pullRequestInformation.authorLogin, gitHubLogin)) {
      logInfo(
        `Found pull request information: ${JSON.stringify(
          pullRequestInformation,
        )}.`,
      );

      mergePromises.push(
        tryMerge(
          octokit,
          {
            maximumRetries,
            requiresStrictStatusChecks: requiresStrictStatusChecksArray[index],
          },
          pullRequestInformation,
        ),
      );
    } else {
      logInfo(
        `Pull request #${pullRequestInformation.pullRequestNumber.toString()} created by ${
          pullRequestInformation.authorLogin
        }, not ${gitHubLogin}, skipping.`,
      );
    }
  }

  await Promise.all(mergePromises);
};
