import {
  ensureDir,
  pathExists,
  readFile,
  readJson,
  writeFile,
  writeJson
} from 'fs-extra';
import path from 'path';
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
import VSCodeService from './VSCodeService.js';

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

describe('VSCodeService', () => {
  // We'll use a mock workspace storage base directory for tests
  let originalGetWorkspaceStorageBaseDir: typeof VSCodeService.getWorkspaceStorageBaseDir;
  let mockStorageBaseDir: string;

  beforeAll(async () => {
    await TestUtils.setupGlobalTempDir();
    // Create a mock workspace storage directory structure
    const testInstanceDir = await TestUtils.setupTestInstance();
    mockStorageBaseDir = path.join(testInstanceDir, 'vscode-storage');
    await ensureDir(mockStorageBaseDir);

    // Mock the getWorkspaceStorageBaseDir method
    originalGetWorkspaceStorageBaseDir =
      VSCodeService.getWorkspaceStorageBaseDir.bind(VSCodeService);
    VSCodeService.getWorkspaceStorageBaseDir = () =>
      Promise.resolve(mockStorageBaseDir);
  });

  afterAll(async () => {
    // Restore the original method
    VSCodeService.getWorkspaceStorageBaseDir =
      originalGetWorkspaceStorageBaseDir;
    await TestUtils.cleanupGlobalTempDir();
  });

  beforeEach(async () => {
    await TestUtils.setupTestInstance();
  });

  afterEach(async () => {
    await TestUtils.cleanupTestInstance();
  });

  describe('getWorkspaceStorageBaseDir', () => {
    it('should return platform-specific workspace storage directory', async () => {
      // Restore original for this test
      const result = await originalGetWorkspaceStorageBaseDir();
      expect(result).toBeDefined();
      expect(result).toContain('workspaceStorage');
    });
  });

  describe('findWorkspaceStorage', () => {
    it('should find existing workspace storage', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();

      // Create a mock workspace storage directory
      const storageHash = 'abc123def456';
      const storagePath = path.join(mockStorageBaseDir, storageHash);
      await ensureDir(storagePath);

      // Create workspace.json
      await writeJson(path.join(storagePath, 'workspace.json'), {
        folder: `file://${testInstanceDir}`
      });

      // Find the workspace storage
      const result = await VSCodeService.findWorkspaceStorage(testInstanceDir);

      expect(result).toBeDefined();
      expect(result?.storageHash).toBe(storageHash);
      expect(result?.storagePath).toBe(storagePath);
      expect(result?.workspacePath).toBe(testInstanceDir);
    });

    it('should return undefined when workspace storage does not exist', async () => {
      const nonExistentPath = '/nonexistent/workspace/path';

      const result = await VSCodeService.findWorkspaceStorage(nonExistentPath);

      expect(result).toBeUndefined();
    });
  });

  describe('createWorkspaceStorage', () => {
    it('should create workspace storage directory and workspace.json', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();

      const result =
        await VSCodeService.createWorkspaceStorage(testInstanceDir);

      expect(result).toBeDefined();
      expect(result.storageHash).toBeDefined();
      expect(result.storagePath).toContain(mockStorageBaseDir);
      expect(result.workspacePath).toBe(testInstanceDir);

      // Verify workspace.json was created
      const workspaceJsonPath = path.join(result.storagePath, 'workspace.json');
      expect(await pathExists(workspaceJsonPath)).toBe(true);

      const workspaceJson = (await readJson(workspaceJsonPath)) as {
        folder: string;
      };
      expect(workspaceJson.folder).toBe(`file://${testInstanceDir}`);
    });
  });

  describe('copyWorkspaceStorage', () => {
    it('should copy workspace storage from source to target', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();
      const sourceDir = path.join(testInstanceDir, 'source-workspace');
      const targetDir = path.join(testInstanceDir, 'target-workspace');

      await ensureDir(sourceDir);
      await ensureDir(targetDir);

      // Create source workspace storage with mock data
      const sourceStorageHash = 'source123';
      const sourceStoragePath = path.join(
        mockStorageBaseDir,
        sourceStorageHash
      );
      await ensureDir(sourceStoragePath);
      await writeJson(path.join(sourceStoragePath, 'workspace.json'), {
        folder: `file://${sourceDir}`
      });

      // Create mock state.vscdb file
      await writeFile(
        path.join(sourceStoragePath, 'state.vscdb'),
        'mock-database-content'
      );

      // Create a mock extension directory
      const extensionDir = path.join(sourceStoragePath, 'github.copilot-chat');
      await ensureDir(extensionDir);
      await writeFile(path.join(extensionDir, 'data.json'), '{"test": true}');

      // Copy workspace storage
      const success = await VSCodeService.copyWorkspaceStorage(
        sourceDir,
        targetDir
      );

      expect(success).toBe(true);

      // Verify target workspace storage was created
      const targetStorage = await VSCodeService.findWorkspaceStorage(targetDir);
      expect(targetStorage).toBeDefined();

      if (!targetStorage) {
        throw new Error('Target storage should be defined');
      }

      // Verify files were copied
      const targetStateDb = path.join(targetStorage.storagePath, 'state.vscdb');
      const targetExtensionDir = path.join(
        targetStorage.storagePath,
        'github.copilot-chat'
      );
      const targetExtensionData = path.join(targetExtensionDir, 'data.json');

      expect(await pathExists(targetStateDb)).toBe(true);
      expect(await pathExists(targetExtensionData)).toBe(true);
    });

    it('should exclude specified items when copying', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();
      const sourceDir = path.join(testInstanceDir, 'source-exclude');
      const targetDir = path.join(testInstanceDir, 'target-exclude');

      await ensureDir(sourceDir);
      await ensureDir(targetDir);

      // Create source workspace storage
      const sourceStorageHash = 'exclude123';
      const sourceStoragePath = path.join(
        mockStorageBaseDir,
        sourceStorageHash
      );
      await ensureDir(sourceStoragePath);
      await writeJson(path.join(sourceStoragePath, 'workspace.json'), {
        folder: `file://${sourceDir}`
      });

      // Create files that should be excluded
      const chatSessionsDir = path.join(sourceStoragePath, 'chatSessions');
      await ensureDir(chatSessionsDir);
      await writeFile(path.join(chatSessionsDir, 'chat1.json'), '{}');

      // Create a file that should be copied
      await writeFile(path.join(sourceStoragePath, 'state.vscdb'), 'mock-data');

      // Copy with exclusions
      const success = await VSCodeService.copyWorkspaceStorage(
        sourceDir,
        targetDir,
        { exclude: ['chatSessions'] }
      );

      expect(success).toBe(true);

      // Verify excluded directory was not copied
      const targetStorage = await VSCodeService.findWorkspaceStorage(targetDir);
      if (!targetStorage) {
        throw new Error('Target storage should be defined');
      }

      const targetChatSessions = path.join(
        targetStorage.storagePath,
        'chatSessions'
      );
      expect(await pathExists(targetChatSessions)).toBe(false);

      // Verify other files were copied
      const targetStateDb = path.join(targetStorage.storagePath, 'state.vscdb');
      expect(await pathExists(targetStateDb)).toBe(true);
    });

    it('should not overwrite existing storage without overwrite flag', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();
      const sourceDir = path.join(testInstanceDir, 'source-no-overwrite');
      const targetDir = path.join(testInstanceDir, 'target-no-overwrite');

      await ensureDir(sourceDir);
      await ensureDir(targetDir);

      // Create source workspace storage
      const sourceStorageHash = 'source-no-ow';
      const sourceStoragePath = path.join(
        mockStorageBaseDir,
        sourceStorageHash
      );
      await ensureDir(sourceStoragePath);
      await writeJson(path.join(sourceStoragePath, 'workspace.json'), {
        folder: `file://${sourceDir}`
      });
      await writeFile(
        path.join(sourceStoragePath, 'state.vscdb'),
        'source-data'
      );

      // Create existing target workspace storage
      const targetStorageHash = 'target-no-ow';
      const targetStoragePath = path.join(
        mockStorageBaseDir,
        targetStorageHash
      );
      await ensureDir(targetStoragePath);
      await writeJson(path.join(targetStoragePath, 'workspace.json'), {
        folder: `file://${targetDir}`
      });
      await writeFile(
        path.join(targetStoragePath, 'state.vscdb'),
        'existing-data'
      );

      // Try to copy without overwrite flag
      const success = await VSCodeService.copyWorkspaceStorage(
        sourceDir,
        targetDir,
        { overwrite: false }
      );

      expect(success).toBe(false);

      // Verify target still has original data
      const targetData = await readFile(
        path.join(targetStoragePath, 'state.vscdb'),
        'utf-8'
      );
      expect(targetData).toBe('existing-data');
    });

    it('should return false when source workspace has no storage', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();
      const sourceDir = path.join(testInstanceDir, 'no-source-storage');
      const targetDir = path.join(testInstanceDir, 'target-no-source');

      await ensureDir(sourceDir);
      await ensureDir(targetDir);

      // Don't create any source workspace storage

      const success = await VSCodeService.copyWorkspaceStorage(
        sourceDir,
        targetDir
      );

      expect(success).toBe(false);
    });
  });

  describe('hasWorkspaceStorage', () => {
    it('should return true when workspace storage exists', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();

      // Create workspace storage
      const storageHash = 'has-storage';
      const storagePath = path.join(mockStorageBaseDir, storageHash);
      await ensureDir(storagePath);
      await writeJson(path.join(storagePath, 'workspace.json'), {
        folder: `file://${testInstanceDir}`
      });

      const hasStorage =
        await VSCodeService.hasWorkspaceStorage(testInstanceDir);

      expect(hasStorage).toBe(true);
    });

    it('should return false when workspace storage does not exist', async () => {
      const nonExistentPath = '/nonexistent/workspace';

      const hasStorage =
        await VSCodeService.hasWorkspaceStorage(nonExistentPath);

      expect(hasStorage).toBe(false);
    });
  });

  describe('deleteWorkspaceStorage', () => {
    it('should delete existing workspace storage', async () => {
      const testInstanceDir = TestUtils.getTestInstanceDir();

      // Create workspace storage
      const storageHash = 'to-delete';
      const storagePath = path.join(mockStorageBaseDir, storageHash);
      await ensureDir(storagePath);
      await writeJson(path.join(storagePath, 'workspace.json'), {
        folder: `file://${testInstanceDir}`
      });
      await writeFile(path.join(storagePath, 'state.vscdb'), 'data');

      // Verify it exists
      expect(await VSCodeService.hasWorkspaceStorage(testInstanceDir)).toBe(
        true
      );

      // Delete it
      const deleted =
        await VSCodeService.deleteWorkspaceByPath(testInstanceDir);

      expect(deleted).toBe(true);
      expect(await VSCodeService.hasWorkspaceStorage(testInstanceDir)).toBe(
        false
      );
    });

    it('should return false when workspace storage does not exist', async () => {
      const nonExistentPath = '/nonexistent/workspace';

      const deleted =
        await VSCodeService.deleteWorkspaceByPath(nonExistentPath);

      expect(deleted).toBe(false);
    });
  });
});
