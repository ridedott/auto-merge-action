import { getInput } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import { isMatch } from 'micromatch';

import { computeRequiresStrictStatusChecksForRefs as computeRequiresStrictStatusChecksForReferences } from '../../common/computeRequiresStrictStatusChecksForRefs';
import { getMergeablePullRequestInformationByPullRequestNumber } from '../../common/getPullRequestInformation';
import { listBranchProtectionRules } from '../../common/listBranchProtectionRules';
import { tryMerge } from '../../common/merge';
import { logInfo, logWarning } from '../../utilities/log';

export const pullRequestHandle = async (
  octokit: ReturnType<typeof getOctokit>,
  gitHubLogin: string,
  maximumRetries: number,
): Promise<void> => {
  const mergeInfoPreviewEnabled =
    getInput('ENABLE_MERGE_INFO_PREVIEW') === 'true';
  const { pull_request: pullRequest } = context.payload;

  if (pullRequest === undefined) {
    logWarning('Required pull request information is unavailable.');

    return;
  }

  const [branchProtectionRules, pullRequestInformation] = await Promise.all([
    await listBranchProtectionRules(
      octokit,
      context.repo.owner,
      context.repo.repo,
    ),
    getMergeablePullRequestInformationByPullRequestNumber(
      octokit,
      {
        pullRequestNumber: pullRequest.number,
        repositoryName: context.repo.repo,
        repositoryOwner: context.repo.owner,
      },
      {
        mergeInfoPreviewEnabled,
      },
    ),
  ]);

  const [
    requiresStrictStatusChecks,
  ] = computeRequiresStrictStatusChecksForReferences(branchProtectionRules, [
    pullRequest.base.ref as string,
  ]);

  if (pullRequestInformation === undefined) {
    logWarning('Unable to fetch pull request information.');
  } else if (isMatch(pullRequestInformation.authorLogin, gitHubLogin)) {
    logInfo(
      `Found pull request information: ${JSON.stringify(
        pullRequestInformation,
      )}.`,
    );

    await tryMerge(
      octokit,
      {
        maximumRetries,
        requiresStrictStatusChecks,
      },
      {
        ...pullRequestInformation,
        commitMessageHeadline: pullRequest.title,
      },
    );
  } else {
    logInfo(
      `Pull request #${pullRequestInformation.pullRequestNumber.toString()} created by ${
        pullRequestInformation.authorLogin
      }, not ${gitHubLogin}, skipping.`,
    );
  }
};
