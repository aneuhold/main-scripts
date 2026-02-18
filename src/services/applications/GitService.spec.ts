import { exists } from 'fs-extra';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { TestUtils } from '../../../test-utils/TestUtils.js';
import CLIService from '../CLIService.js';
import GitService from './GitService.js';

// Mock the logger to avoid console noise during tests
vi.mock('@aneuhold/core-ts-lib', async () => {
  const actual = await vi.importActual('@aneuhold/core-ts-lib');
  return {
    ...actual,
    DR: {
      logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        success: vi.fn(),
        verbose: {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn()
        }
      }
    }
  };
});

describe('GitService', () => {
  // Global setup/teardown for the tmp directory
  beforeAll(async () => {
    await TestUtils.setupGlobalTempDir();
  });

  afterAll(async () => {
    await TestUtils.cleanupGlobalTempDir();
  });

  beforeEach(async () => {
    await TestUtils.setupTestInstance();
  });

  afterEach(async () => {
    await TestUtils.cleanupTestInstance();
  });

  describe('addWorktree', () => {
    it('should create a new worktree with a new branch', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();

      // Initialize a git repository with initial commit
      await initializeGitRepo(testInstanceDir);

      // Change to test directory so GitService commands work correctly
      const originalCwd = process.cwd();
      process.chdir(testInstanceDir);

      try {
        // Create a worktree
        const worktreePath = `${testInstanceDir}-wt-feature`;
        await GitService.addWorktree('feature', worktreePath);

        // Verify the worktree was created
        const worktrees = await GitService.getWorktreesInfo();
        expect(worktrees.length).toBe(2); // Main + new worktree

        const featureWorktree = worktrees.find((wt) => wt.branch === 'feature');
        expect(featureWorktree).toBeDefined();
        expect(featureWorktree?.path).toBe(worktreePath);
        expect(featureWorktree?.isMain).toBe(false);
      } finally {
        // Restore original directory
        process.chdir(originalCwd);
      }
    });

    it('should create worktree from existing branch', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();

      // Initialize a git repository with initial commit
      await initializeGitRepo(testInstanceDir);

      // Change to test directory
      const originalCwd = process.cwd();
      process.chdir(testInstanceDir);

      try {
        // First create a branch
        await CLIService.execCmd(
          'git branch feature-existing',
          false,
          testInstanceDir
        );

        const worktreePath = `${testInstanceDir}-wt-existing-branch`;

        // Create a worktree from the existing 'feature-existing' branch
        // This should succeed without trying to create a new branch with -b
        await GitService.addWorktree('feature-existing', worktreePath);

        // Verify it was created
        const worktrees = await GitService.getWorktreesInfo();
        expect(worktrees.length).toBe(2); // Main + new worktree

        const featureWorktree = worktrees.find(
          (wt) => wt.path === worktreePath && wt.branch === 'feature-existing'
        );
        expect(featureWorktree).toBeDefined();
        expect(featureWorktree?.isMain).toBe(false);
      } finally {
        // Restore original directory
        process.chdir(originalCwd);
      }
    });
  });

  describe('getWorktreesInfo', () => {
    it('should return main worktree when only main exists', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();

      // Initialize a git repository with initial commit
      await initializeGitRepo(testInstanceDir);

      // Change to test directory
      const originalCwd = process.cwd();
      process.chdir(testInstanceDir);

      try {
        // Get worktrees
        const worktrees = await GitService.getWorktreesInfo();

        expect(worktrees.length).toBe(1);
        expect(worktrees[0].isMain).toBe(true);
        expect(worktrees[0].path).toBe(testInstanceDir);
      } finally {
        // Restore original directory
        process.chdir(originalCwd);
      }
    });
  });

  describe('getMainWorktreePath', () => {
    it('should return the main worktree path', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();

      // Initialize a git repository with initial commit
      await initializeGitRepo(testInstanceDir);

      // Change to test directory
      const originalCwd = process.cwd();
      process.chdir(testInstanceDir);

      try {
        // Get main worktree path
        const mainPath = await GitService.getMainWorktreePath();

        expect(mainPath).toBe(testInstanceDir);
      } finally {
        // Restore original directory
        process.chdir(originalCwd);
      }
    });

    it('should return the correct main worktree path within a git submodule whose name differs from its path', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();
      const parentRepoPath = `${testInstanceDir}/parent-repo`;
      const childRepoPath = `${testInstanceDir}/child-repo`;
      // The submodule lives at repos/rxp but git stores its data under
      // .git/modules/rxp (using the submodule name, not the path). This
      // mismatch is what caused the original bug.
      const submodulePath = `${parentRepoPath}/repos/rxp`;

      const originalCwd = process.cwd();

      try {
        // Create and initialize parent repository
        await CLIService.execCmd(`mkdir -p "${parentRepoPath}"`);
        await initializeGitRepo(parentRepoPath);

        // Create and initialize child repository (to be used as submodule)
        await CLIService.execCmd(`mkdir -p "${childRepoPath}"`);
        await initializeGitRepo(childRepoPath);

        // Enable file protocol for git (needed for local submodules in tests)
        process.chdir(parentRepoPath);
        await CLIService.execCmd(
          'git config --global protocol.file.allow always'
        );

        // Add child repository as a submodule with a name ("rxp") that differs
        // from its path ("repos/rxp"). This reproduces the real-world scenario
        // where .git/modules/rxp != repos/rxp.
        await CLIService.execCmd(`mkdir -p "${parentRepoPath}/repos"`);
        const { didComplete: submoduleAdded, output: submoduleOutput } =
          await CLIService.execCmd(
            `git submodule add --name rxp "${childRepoPath}" repos/rxp`
          );

        if (!submoduleAdded) {
          throw new Error(`Failed to add submodule: ${submoduleOutput}`);
        }

        // Verify submodule directory exists before committing
        const submoduleExists = await exists(submodulePath);
        expect(submoduleExists).toBe(true);

        await CLIService.execCmd('git commit -m "Add submodule"');

        // Navigate into the submodule
        process.chdir(submodulePath);

        // Verify we're in a git repository
        const { didComplete: isGitRepo } = await CLIService.execCmd(
          'git rev-parse --git-dir'
        );
        expect(isGitRepo).toBe(true);

        // Get main worktree path from within the submodule
        // Should return the actual working directory path, not the .git/modules path
        const mainPath = await GitService.getMainWorktreePath();
        expect(mainPath).toBe(submodulePath);

        // Create a worktree as a sibling to the submodule
        const worktreePath = `${parentRepoPath}/repos/rxp-wt-test`;
        await GitService.addWorktree('test', worktreePath);

        // Verify worktrees were created correctly
        const worktrees = await GitService.getWorktreesInfo();
        expect(worktrees.length).toBe(2);

        // Verify the main worktree is identified correctly with the converted path
        const mainWorktree = worktrees.find((wt) => wt.isMain);
        expect(mainWorktree).toBeDefined();
        expect(mainWorktree?.path).toBe(submodulePath);

        // Verify git's actual working directory matches what we expect
        const { output: actualWorkingDir } = await CLIService.execCmd(
          'git rev-parse --show-toplevel'
        );
        expect(actualWorkingDir.trim()).toBe(submodulePath);

        // Navigate to the worktree and verify getMainWorktreePath still works
        process.chdir(worktreePath);
        const mainPathFromWorktree = await GitService.getMainWorktreePath();
        expect(mainPathFromWorktree).toBe(submodulePath);

        // Verify the worktree is not marked as main
        const testWorktree = worktrees.find((wt) => wt.branch === 'test');
        expect(testWorktree).toBeDefined();
        expect(testWorktree?.isMain).toBe(false);
        expect(testWorktree?.path).toBe(worktreePath);
      } finally {
        // Restore original directory
        process.chdir(originalCwd);

        // Reset git config to default (unset the protocol.file.allow setting)
        await CLIService.execCmd(
          'git config --global --unset protocol.file.allow',
          false
        );
      }
    });
  });
});

/**
 * Helper function to create an initial commit in a test repository.
 *
 * @param repoPath Path to the git repository
 */
async function createInitialCommit(repoPath: string): Promise<void> {
  await CLIService.execCmd('echo "test" > README.md', false, repoPath);
  await CLIService.execCmd('git add .', false, repoPath);
  await CLIService.execCmd('git commit -m "Initial commit"', false, repoPath);
}

/**
 * Helper function to initialize a git repository with user config and initial commit.
 *
 * @param repoPath Path where the git repository should be initialized
 */
async function initializeGitRepo(repoPath: string): Promise<void> {
  await CLIService.execCmd('git init', false, repoPath);
  // For some reason the submodule doesn't get created in CI without user config. Really not sure
  // why as of 2/4/2026.
  await CLIService.execCmd('git config user.name "Test User"', false, repoPath);
  await createInitialCommit(repoPath);
}
