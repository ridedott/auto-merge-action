import { getOctokit } from '@actions/github';
import { GraphQlQueryResponseData } from '@octokit/graphql';

import { IterableList, makeGraphqlIterator } from './makeGraphqlIterator';

const listBranchProtectionRulesQuery = `
  query($endCursor: String, $pageSize: Int!, $repositoryName: String!, $repositoryOwner: String!) {
    repository(name: $repositoryName, owner: $repositoryOwner) {
      branchProtectionRules(first: $pageSize, after: $endCursor) {
        edges {
          node {
            pattern
            requiresStrictStatusChecks
          }
        }
      }
    }
  }
`;

export interface BranchProtectionRule {
  pattern: string;
  requiresStrictStatusChecks: boolean;
}

/**
 * Returns an array containing a repository's configured partial branch
 * protection rules.
 */
export const listBranchProtectionRules = async (
  octokit: ReturnType<typeof getOctokit>,
  repositoryOwner: string,
  repositoryName: string,
): Promise<BranchProtectionRule[]> => {
  const iterator = makeGraphqlIterator<BranchProtectionRule>(octokit, {
    extractListFunction: (
      response: GraphQlQueryResponseData,
    ): IterableList<BranchProtectionRule> =>
      response.repository.branchProtectionRules,
    parameters: {
      pageSize: 100,
      repositoryName,
      repositoryOwner,
    },
    query: listBranchProtectionRulesQuery,
  });

  const branchProtectionRules: BranchProtectionRule[] = [];

  for await (const node of iterator) {
    branchProtectionRules.push(node);
  }

  return branchProtectionRules;
};
