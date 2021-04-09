export interface CommitMessageHeadlineGroup {
  groups: {
    commitHeadline: string;
  };
}

export interface GroupName {
  groups: {
    name: string;
  };
}

export type ReviewEdges = Array<
  | {
      node: {
        state:
          | 'APPROVED'
          | 'CHANGES_REQUESTED'
          | 'COMMENTED'
          | 'DISMISSED'
          | 'PENDING';
      };
    }
  | undefined
>;

export interface PullRequestInformationContinuousIntegrationEnd {
  authorLogin: string;
  commitMessage: string;
  commitMessageHeadline: string;
  mergeStateStatus?: MergeStateStatus;
  mergeableState: MergeableState;
  merged: boolean;
  pullRequestId: string;
  pullRequestNumber: number;
  pullRequestState: PullRequestState;
  pullRequestTitle: string;
  repositoryName: string;
  repositoryOwner: string;
  reviewEdges: ReviewEdges;
}

interface PullRequest {
  author: {
    login: string;
  };
  commits: {
    edges: Array<{
      node: {
        commit: {
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
  pullRequest: {
    number: number;
  };
  reviews: { edges: ReviewEdges };
  state: PullRequestState;
  title: string;
}

export interface PullRequestCommitNode {
  commit: {
    author: {
      user: {
        login: string;
      };
    };
    signature: {
      isValid: boolean;
    };
  };
}

export interface FindPullRequestsInfoByReferenceNameResponse {
  repository: {
    pullRequests: {
      nodes: PullRequest[];
    };
  };
}

export interface FindPullRequestInfoByNumberResponse {
  repository: {
    pullRequest: PullRequest;
  };
}

export interface FindPullRequestCommits {
  repository: {
    pullRequest: {
      commits: {
        edges: Array<{
          node: PullRequestCommitNode;
        }>;
        pageInfo: {
          endCursor;
          hasNextPage;
        };
      };
    };
  };
}

export type MergeableState = 'CONFLICTING' | 'MERGEABLE' | 'UNKNOWN';

export type PullRequestState = 'CLOSED' | 'MERGED' | 'OPEN';

export type MergeStateStatus =
  | 'BEHIND'
  | 'BLOCKED'
  | 'CLEAN'
  | 'DIRTY'
  | 'DRAFT'
  | 'HAS_HOOKS'
  | 'UNKNOWN'
  | 'UNSTABLE';
