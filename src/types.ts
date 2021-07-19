export interface CommitMessageHeadlineGroup {
  groups: {
    commitHeadline: string;
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

export interface PullRequestInformation {
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

export interface PullRequest {
  author: {
    login: string;
  };
  base: {
    ref: string;
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
  number: number;
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
    } | null;
  };
}

export interface FindPullRequestInfoByNumberResponse {
  repository: {
    pullRequest: PullRequest;
  };
}

export interface FindPullRequestCommitsResponse {
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
