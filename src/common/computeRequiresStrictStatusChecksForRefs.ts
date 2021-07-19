import { isMatch } from 'micromatch';

import { BranchProtectionRule } from './listBranchProtectionRules';

/**
 * Returns an array of booleans indicating whether the provided pull requests
 * require their branches to be up to date before merging.
 */
export const computeRequiresStrictStatusChecksForRefs = (
  branchProtectionRules: BranchProtectionRule[],
  refs: string[],
): boolean[] =>
  refs.map((reference: string): boolean =>
    branchProtectionRules.some(
      ({
        pattern,
        requiresStrictStatusChecks,
      }: BranchProtectionRule): boolean =>
        isMatch(reference, pattern) && requiresStrictStatusChecks === true,
    ),
  );
