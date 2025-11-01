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

      // Initialize a git repository
      await CLIService.execCmd('git init', false, testInstanceDir);
      await CLIService.execCmd(
        'git config user.email "test@example.com"',
        false,
        testInstanceDir
      );
      await CLIService.execCmd(
        'git config user.name "Test User"',
        false,
        testInstanceDir
      );

      // Create an initial commit (required for worktrees)
      await CLIService.execCmd(
        'echo "test" > README.md',
        false,
        testInstanceDir
      );
      await CLIService.execCmd('git add .', false, testInstanceDir);
      await CLIService.execCmd(
        'git commit -m "Initial commit"',
        false,
        testInstanceDir
      );

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
    });
  });

  describe('getWorktreesInfo', () => {
    it('should return main worktree when only main exists', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();

      // Initialize a git repository
      await CLIService.execCmd('git init', false, testInstanceDir);
      await CLIService.execCmd(
        'git config user.email "test@example.com"',
        false,
        testInstanceDir
      );
      await CLIService.execCmd(
        'git config user.name "Test User"',
        false,
        testInstanceDir
      );

      // Create an initial commit
      await CLIService.execCmd(
        'echo "test" > README.md',
        false,
        testInstanceDir
      );
      await CLIService.execCmd('git add .', false, testInstanceDir);
      await CLIService.execCmd(
        'git commit -m "Initial commit"',
        false,
        testInstanceDir
      );

      // Get worktrees
      const worktrees = await GitService.getWorktreesInfo();

      expect(worktrees.length).toBe(1);
      expect(worktrees[0].isMain).toBe(true);
      expect(worktrees[0].path).toBe(testInstanceDir);
    });
  });

  describe('getMainWorktreePath', () => {
    it('should return the main worktree path', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();

      // Initialize a git repository
      await CLIService.execCmd('git init', false, testInstanceDir);
      await CLIService.execCmd(
        'git config user.email "test@example.com"',
        false,
        testInstanceDir
      );
      await CLIService.execCmd(
        'git config user.name "Test User"',
        false,
        testInstanceDir
      );

      // Create an initial commit
      await CLIService.execCmd(
        'echo "test" > README.md',
        false,
        testInstanceDir
      );
      await CLIService.execCmd('git add .', false, testInstanceDir);
      await CLIService.execCmd(
        'git commit -m "Initial commit"',
        false,
        testInstanceDir
      );

      // Get main worktree path
      const mainPath = await GitService.getMainWorktreePath();

      expect(mainPath).toBe(testInstanceDir);
    });
  });
});
