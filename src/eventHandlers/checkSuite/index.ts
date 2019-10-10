/* eslint-disable no-await-in-loop */

import { info, warning } from '@actions/core';
import { context, GitHub } from '@actions/github';

import { DEPENDABOT_GITHUB_LOGIN } from '../../constants';
import { approveAndMergePullRequestMutation } from '../../graphql/mutations';
import { findPullRequestNodeIdAndLastCommit } from '../../graphql/queries';

export const checkSuiteHandle = async (octokit: GitHub): Promise<void> => {
  const pullRequests = context.payload.check_suite.pull_requests;

  for (const pullRequest of pullRequests) {
    if (
      typeof context.payload.sender === 'object' &&
      context.payload.sender.login === DEPENDABOT_GITHUB_LOGIN
    ) {
      try {
        const pullRequestNumber = pullRequest.number;
        const repositoryName = context.repo.repo;
        const repositoryOwner = context.repo.owner;

        const {
          repository: {
            pullRequests: {
              id: pullRequestId,
              commits: {
                edges: [
                  {
                    node: {
                      commit: { message: commitHeadline },
                    },
                  },
                ],
              },
            },
          },
        } = await octokit.graphql(findPullRequestNodeIdAndLastCommit, {
          pullRequestNumber,
          repositoryName,
          repositoryOwner,
        });

        info(
          `checkSuiteHandle: PullRequestId: ${pullRequestId}, commitHeadline: ${commitHeadline}.`,
        );

        await octokit.graphql(approveAndMergePullRequestMutation, {
          commitHeadline,
          pullRequestId,
        });
      } catch (error) {
        warning(error);
        warning(JSON.stringify(error));
      }
    } else {
      info('Pull request not created by Dependabot, skipping.');
    }
  }
};
