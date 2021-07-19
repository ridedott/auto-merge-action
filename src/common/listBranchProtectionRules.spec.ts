import { getOctokit } from '@actions/github';
import { StatusCodes } from 'http-status-codes';
import * as nock from 'nock';

import { listBranchProtectionRules } from './listBranchProtectionRules';

/**
 * Test interfaces and types
 */
interface BranchProtectionRuleNode {
  node: {
    pattern: string;
    requiresStrictStatusChecks: boolean;
  };
}

interface GraphQLResponse {
  repository: {
    branchProtectionRules: {
      edges: BranchProtectionRuleNode[];
      pageInfo: {
        endCursor: string;
        hasNextPage: boolean;
      };
    };
  };
}

/**
 * Test utilities
 */
const octokit = getOctokit('SECRET_GITHUB_TOKEN');
const repositoryName = 'test-repository';
const repositoryOwner = 'test-owner';

const makeBranchProtectionRuleNode = (
  pattern: string = 'master',
  requiresStrictStatusChecks: boolean = true,
): BranchProtectionRuleNode => ({
  node: {
    pattern,
    requiresStrictStatusChecks,
  },
});

const makeGraphQLResponse = (
  branchProtectionRuleNodes: BranchProtectionRuleNode[] = [],
  endCursor: string = '',
  hasNextPage: boolean = false,
): GraphQLResponse => ({
  repository: {
    branchProtectionRules: {
      edges: branchProtectionRuleNodes,
      pageInfo: {
        endCursor,
        hasNextPage,
      },
    },
  },
});

/**
 * Tests
 */
describe('listBranchProtectionRules', (): void => {
  it('returns an empty array when the repository has no branch protection rules', async (): Promise<void> => {
    expect.assertions(1);

    nock('https://api.github.com').post('/graphql').reply(StatusCodes.OK, {
      data: makeGraphQLResponse(),
    });

    const result = await listBranchProtectionRules(
      octokit,
      repositoryOwner,
      repositoryName,
    );

    expect(result).toStrictEqual([]);
  });

  it('returns an array of branch protection rules when a repository has branch protection rules configured', async (): Promise<void> => {
    expect.assertions(1);

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, {
        data: makeGraphQLResponse([
          makeBranchProtectionRuleNode('dev', true),
          makeBranchProtectionRuleNode('master', false),
        ]),
      });

    const result = await listBranchProtectionRules(
      octokit,
      repositoryOwner,
      repositoryName,
    );

    expect(result).toStrictEqual([
      {
        pattern: 'dev',
        requiresStrictStatusChecks: true,
      },
      {
        pattern: 'master',
        requiresStrictStatusChecks: false,
      },
    ]);
  });

  it('returns all results when distributed across multiple pages', async (): Promise<void> => {
    expect.assertions(1);

    nock('https://api.github.com')
      .post('/graphql')
      .reply(StatusCodes.OK, {
        data: makeGraphQLResponse(
          [
            makeBranchProtectionRuleNode('dev', true),
            makeBranchProtectionRuleNode('master', false),
          ],
          'next-page-cursor',
          true,
        ),
      })
      .post('/graphql')
      .reply(StatusCodes.OK, {
        data: makeGraphQLResponse(
          [makeBranchProtectionRuleNode('test', true)],
          '',
          false,
        ),
      });

    const result = await listBranchProtectionRules(
      octokit,
      repositoryOwner,
      repositoryName,
    );

    expect(result).toStrictEqual([
      {
        pattern: 'dev',
        requiresStrictStatusChecks: true,
      },
      {
        pattern: 'master',
        requiresStrictStatusChecks: false,
      },
      {
        pattern: 'test',
        requiresStrictStatusChecks: true,
      },
    ]);
  });
});
