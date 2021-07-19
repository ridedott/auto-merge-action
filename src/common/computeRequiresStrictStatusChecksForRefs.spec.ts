import { computeRequiresStrictStatusChecksForRefs as computeRequiresStrictStatusChecksForReferences } from './computeRequiresStrictStatusChecksForRefs';

/**
 * Tests
 */
describe('computeRequiresStrictStatusChecksForRefs', (): void => {
  it('returns false for all refs when no branch protection rules exist for the repository', (): void => {
    expect.assertions(1);

    const result = computeRequiresStrictStatusChecksForReferences(
      [],
      ['master', 'dev'],
    );

    expect(result).toStrictEqual([false, false]);
  });

  it('returns false for all refs when none of the branch protection rule patterns match provided refs', (): void => {
    expect.assertions(1);

    const result = computeRequiresStrictStatusChecksForReferences(
      [
        {
          pattern: 'test1',
          requiresStrictStatusChecks: true,
        },
        {
          pattern: 'test2',
          requiresStrictStatusChecks: true,
        },
      ],
      ['master', 'dev'],
    );

    expect(result).toStrictEqual([false, false]);
  });

  it('returns false for all refs when all matching branch protection rule patterns do not require strict status checks', (): void => {
    expect.assertions(1);

    const result = computeRequiresStrictStatusChecksForReferences(
      [
        {
          pattern: 'dev',
          requiresStrictStatusChecks: false,
        },
        {
          pattern: 'master',
          requiresStrictStatusChecks: false,
        },
      ],
      ['master', 'dev'],
    );

    expect(result).toStrictEqual([false, false]);
  });

  it('returns true for refs when matching branch protection rules require strict status checks', (): void => {
    expect.assertions(1);

    const result = computeRequiresStrictStatusChecksForReferences(
      [
        {
          pattern: 'dev',
          requiresStrictStatusChecks: true,
        },
        {
          pattern: 'master',
          requiresStrictStatusChecks: false,
        },
      ],
      ['master', 'dev'],
    );

    expect(result).toStrictEqual([false, true]);
  });
});
