import { DR, ErrorUtils } from '@aneuhold/core-ts-lib';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import CurrentEnv, { OperatingSystemType } from '../../utils/CurrentEnv.js';
import CLIService from '../CLIService.js';
import { ConfigService } from '../ConfigService.js';
import { ProjectConfigService } from '../ProjectConfigService.js';

/**
 * Represents information about a VS Code workspace storage directory.
 */
export type WorkspaceStorageInfo = {
  /** The hash-based directory name for this workspace */
  storageHash: string;
  /** The absolute path to the workspace storage directory */
  storagePath: string;
  /** The workspace folder path */
  workspacePath: string;
};

/**
 * Supported editor types for workspace storage
 */
enum EditorType {
  VSCode = 'VSCode',
  VSCodeInsiders = 'VSCodeInsiders',
  Cursor = 'Cursor',
  Windsurf = 'Windsurf'
}

/**
 * Service for interacting with VS Code (and VS Code-based editors) workspace storage.
 *
 * VS Code and its forks (Cursor, Windsurf, etc.) store workspace-specific data in platform-specific locations:
 * - macOS: ~/Library/Application Support/{EditorName}/User/workspaceStorage/
 * - Windows: %APPDATA%\{EditorName}\User\workspaceStorage\
 * - Linux: ~/.config/{EditorName}/User/workspaceStorage/
 *
 * To navigate to VS Code storage on Mac: `cd ~/Library/Application\ Support/Code`
 * To navigate to VS Code Insiders storage on Mac: `cd ~/Library/Application\ Support/Code\ -\ Insiders`
 * To navigate to Cursor storage on Mac: `cd ~/Library/Application\ Support/Cursor`
 * To navigate to Windsurf storage on Mac: `cd ~/Library/Application\ Support/Windsurf`
 *
 * Each workspace gets a unique directory named by a hash of the workspace path.
 * Inside each directory:
 * - workspace.json: Identifies which folder this storage belongs to
 * - state.vscdb: SQLite database containing workspace state
 * - Extension-specific subdirectories: Per-extension workspace storage
 *
 * This service helps copy workspace state from one workspace to another,
 * which is particularly useful when creating git worktrees.
 */
export default class VSCodeService {
  private static readonly WORKSPACE_METADATA_FILE = 'workspace.json';

  /**
   * Command patterns mapped to their editor types
   */
  private static readonly COMMAND_TO_EDITOR_MAP: Record<string, EditorType> = {
    // VS Code commands
    code: EditorType.VSCode,
    'code-insiders': EditorType.VSCodeInsiders,
    // Cursor commands
    cursor: EditorType.Cursor,
    // Windsurf commands
    ws: EditorType.Windsurf,
    surf: EditorType.Windsurf,
    windsurf: EditorType.Windsurf
  };

  /**
   * Directory names for each editor type
   */
  private static readonly EDITOR_DIR_NAMES: Record<EditorType, string> = {
    [EditorType.VSCode]: 'Code',
    [EditorType.VSCodeInsiders]: 'Code - Insiders',
    [EditorType.Cursor]: 'Cursor',
    [EditorType.Windsurf]: 'Windsurf'
  };

  /**
   * Keys to remove from state.vscdb when copying workspace storage.
   * These are removed to prevent issues with stale state when creating worktrees.
   */
  private static readonly STATE_KEYS_TO_REMOVE = [
    {
      key: 'memento/workbench.parts.editor',
      reason: 'Open tabs and editor layout - will be empty on fresh workspace'
    },
    {
      key: 'history.entries',
      reason: 'File history - will be regenerated as files are opened'
    },
    {
      key: 'workbench.search.history',
      reason: 'Search history - not needed in new worktree'
    },
    {
      key: 'workbench.find.history',
      reason: 'Find history - not needed in new worktree'
    }
  ] as const;

  private static async getEditorCommand(): Promise<string> {
    const config = await ConfigService.loadConfig();
    const project = await ProjectConfigService.getCurrentProject();
    // Priority: project-specific config > global config > default 'code'
    return (
      project?.vsCodeAlternativeCommand ??
      config.vsCodeAlternativeCommand ??
      'code'
    );
  }

  /**
   * Determines the editor type based on the configured command.
   * Defaults to VSCode if the command is not recognized.
   *
   * @returns The editor type (VSCode, Cursor, or Windsurf)
   */
  private static async getEditorType(): Promise<EditorType> {
    const command = await this.getEditorCommand();

    // Normalize the command to lowercase for case-insensitive matching
    const normalizedCommand = command.toLowerCase();

    // Look up the editor type
    return this.COMMAND_TO_EDITOR_MAP[normalizedCommand] ?? EditorType.VSCode;
  }

  /**
   * Gets the base directory where the current editor stores workspace storage.
   * This is platform-specific and editor-specific:
   * - macOS: ~/Library/Application Support/{EditorName}/User/workspaceStorage/
   * - Windows: %APPDATA%\{EditorName}\User\workspaceStorage\
   * - Linux: ~/.config/{EditorName}/User/workspaceStorage/
   *
   * The editor name is determined by the configured `vsCodeAlternativeCommand`:
   * - 'code', 'code-insiders' → 'Code'
   * - 'cursor' → 'Cursor'
   * - 'ws', 'surf', 'windsurf' → 'Windsurf'
   *
   * @returns The absolute path to the workspace storage base directory
   */
  public static async getWorkspaceStorageBaseDir(): Promise<string> {
    const currentOs = CurrentEnv.os;
    const homeDir = CurrentEnv.homeDir();
    const editorType = await this.getEditorType();
    const editorDirName = this.EDITOR_DIR_NAMES[editorType];

    switch (currentOs) {
      case OperatingSystemType.MacOSX:
        return path.join(
          homeDir,
          'Library',
          'Application Support',
          editorDirName,
          'User',
          'workspaceStorage'
        );
      case OperatingSystemType.Windows:
        return path.join(
          process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
          editorDirName,
          'User',
          'workspaceStorage'
        );
      case OperatingSystemType.Linux:
        return path.join(
          homeDir,
          '.config',
          editorDirName,
          'User',
          'workspaceStorage'
        );
      default:
        throw new Error(`Unsupported operating system: ${currentOs}`);
    }
  }

  /**
   * Opens the specified path in VS Code or a VS Code alternative (like Cursor, Windsurf, etc.).
   *
   * Uses the configured `vsCodeAlternativeCommand` from either the project-specific config
   * or the global config. Falls back to `code` if not configured.
   *
   * @param targetPath The path to open. Defaults to '.' (current directory)
   */
  public static async openVSCode(targetPath: string = '.'): Promise<void> {
    const command = await this.getEditorCommand();

    DR.logger.success(`Opening ${targetPath} with ${command}...`);
    await CLIService.execCmdWithTimeout(`${command} ${targetPath}`, 4000);
  }

  /**
   * Finds the workspace storage directory for a given workspace path by
   * searching through all workspace storage directories.
   *
   * This searches for workspace.json files in the storage base directory
   * and matches them against the provided workspace path.
   *
   * @param workspacePath The absolute path to the workspace folder
   * @returns WorkspaceStorageInfo if found, undefined otherwise
   */
  public static async findWorkspaceStorage(
    workspacePath: string
  ): Promise<WorkspaceStorageInfo | undefined> {
    try {
      const normalizedPath = this.normalizeWorkspacePath(workspacePath);

      DR.logger.verbose.info(
        `Searching for workspace storage for: ${normalizedPath}`
      );

      const storageInfo = await this.lookupStorageByWorkspace(normalizedPath);

      if (!storageInfo) {
        DR.logger.verbose.info(
          `No workspace storage found for: ${normalizedPath}`
        );
      } else {
        DR.logger.verbose.info(
          `Found workspace storage: ${storageInfo.storageHash} for ${normalizedPath}`
        );
      }

      return storageInfo;
    } catch (error) {
      DR.logger.error(
        `Error finding workspace storage: ${ErrorUtils.getErrorString(error)}`
      );
      return undefined;
    }
  }

  /**
   * Creates a workspace storage directory for a given workspace folder path.
   *
   * This method computes the workspace ID using VS Code's exact algorithm:
   * MD5(workspacePath + folderCreationTime)
   *
   * IMPORTANT: The workspace folder MUST already exist on the filesystem before
   * calling this method, as it needs to read the folder's creation time to
   * compute the correct workspace ID that VS Code will use.
   *
   * This is particularly useful when creating git worktrees:
   * 1. Git creates the worktree folder
   * 2. Call this method to pre-create storage with the correct ID
   * 3. Copy storage from source workspace
   * 4. When VS Code opens the worktree, it will find the pre-created storage
   *
   * @param workspacePath The absolute path to the workspace folder (must exist)
   * @returns WorkspaceStorageInfo for the newly created storage directory
   */
  public static async createWorkspaceStorage(
    workspacePath: string
  ): Promise<WorkspaceStorageInfo> {
    try {
      const normalizedPath = this.normalizeWorkspacePath(workspacePath);

      // Verify the workspace folder exists
      if (!(await fs.pathExists(normalizedPath))) {
        throw new Error(
          `Workspace folder does not exist: ${normalizedPath}. ` +
            `The folder must be created before calling createWorkspaceStorage.`
        );
      }

      // Compute the workspace ID using VS Code's algorithm
      // This matches: src/vs/platform/workspaces/node/workspaces.ts
      const storageHash = await this.computeWorkspaceId(normalizedPath);
      const storagePath = await this.buildStoragePath(storageHash);

      const storageAlreadyExists = await fs.pathExists(storagePath);

      await fs.ensureDir(storagePath);
      await this.writeWorkspaceMetadata(storagePath, normalizedPath);

      DR.logger.verbose.info(
        `${storageAlreadyExists ? 'Updated' : 'Created'} workspace storage: ${storageHash} for ${normalizedPath}`
      );

      return {
        storageHash,
        storagePath,
        workspacePath: normalizedPath
      };
    } catch (error) {
      throw new Error(
        `Failed to create workspace storage: ${ErrorUtils.getErrorString(error)}`
      );
    }
  }

  /**
   * Computes the workspace ID that VS Code will use for a given folder path.
   *
   * This replicates VS Code's algorithm from:
   * https://github.com/microsoft/vscode/blob/main/src/vs/platform/workspaces/node/workspaces.ts#L50-L80
   *
   * The algorithm:
   * 1. Get the folder's creation time (birthtime on macOS/Windows, inode on Linux)
   * 2. Compute MD5(path + creationTime)
   *
   * The storage directory is created by:
   * https://github.com/microsoft/vscode/blob/main/src/vs/platform/storage/electron-main/storageMain.ts#L383-L404
   *
   * @param workspacePath The absolute path to the workspace folder
   * @returns The workspace ID (32-character hex string)
   */
  private static async computeWorkspaceId(
    workspacePath: string
  ): Promise<string> {
    const stats = await fs.stat(workspacePath);
    const currentOs = CurrentEnv.os;

    // Get creation time based on platform
    // This matches VS Code's platform-specific logic
    let ctime: number;
    if (currentOs === OperatingSystemType.Linux) {
      // Linux: use inode number
      ctime = stats.ino;
    } else if (currentOs === OperatingSystemType.MacOSX) {
      // macOS: use birthtime (file creation time)
      ctime = stats.birthtime.getTime();
    } else {
      // Windows: use birthtimeMs with precision fix
      ctime = Math.floor(stats.birthtimeMs);
    }

    // Compute MD5 hash: MD5(path + ctime)
    const hash = createHash('md5')
      .update(workspacePath)
      .update(String(ctime))
      .digest('hex');

    return hash;
  }

  /**
   * Copies workspace storage from one workspace to another.
   *
   * This copies all VS Code workspace-specific state including:
   * - state.vscdb: Extension enabled/disabled state, UI state, etc.
   * - Extension-specific subdirectories: Per-extension workspace storage
   * - Other workspace-specific files
   *
   * Note: Certain keys are automatically removed from state.vscdb to prevent
   * issues with stale state (tabs, file history, search history). See STATE_KEYS_TO_REMOVE.
   *
   * This is particularly useful when creating git worktrees, as it allows
   * the new worktree to inherit the same VS Code configuration as the original.
   *
   * @param sourceWorkspacePath The absolute path to the source workspace
   * @param targetWorkspacePath The absolute path to the target workspace
   * @param options Configuration options for the copy operation
   * @param options.overwrite If true, overwrites existing workspace storage for target
   * @param options.exclude Array of file/directory names to exclude from copying
   * @returns true if successful, false otherwise
   */
  public static async copyWorkspaceStorage(
    sourceWorkspacePath: string,
    targetWorkspacePath: string,
    options: {
      /** If true, overwrites existing workspace storage for target */
      overwrite?: boolean;
      /**
       * Array of file/directory names to exclude from copying.
       * Useful for excluding large or temporary files.
       * Example: ['chatSessions', 'chatEditingSessions']
       */
      exclude?: string[];
    } = {}
  ): Promise<boolean> {
    try {
      const { overwrite = false, exclude = [] } = options;

      DR.logger.info(
        'Copying VS Code workspace storage from source to target worktree...'
      );

      // Find source workspace storage
      const sourceStorage =
        await this.findWorkspaceStorage(sourceWorkspacePath);
      if (!sourceStorage) {
        DR.logger.warn(
          `No workspace storage found for source: ${sourceWorkspacePath}`
        );
        DR.logger.info(
          'This is normal if the workspace has never been opened in VS Code.'
        );
        return false;
      }

      DR.logger.verbose.info(
        `Source storage found at: ${sourceStorage.storagePath}`
      );

      // Check if target already has workspace storage
      let targetStorage = await this.findWorkspaceStorage(targetWorkspacePath);

      if (targetStorage && !overwrite) {
        DR.logger.info(
          'Target workspace already has storage. Skipping copy (use overwrite option to replace).'
        );
        return false;
      }

      // Create or refresh target workspace storage directory
      if (!targetStorage) {
        targetStorage = await this.createWorkspaceStorage(targetWorkspacePath);
      } else if (overwrite) {
        await this.writeWorkspaceMetadata(
          targetStorage.storagePath,
          targetStorage.workspacePath
        );
      }

      DR.logger.verbose.info(`Target storage at: ${targetStorage.storagePath}`);

      await this.copyStorageContents({
        sourcePath: sourceStorage.storagePath,
        targetPath: targetStorage.storagePath,
        exclude
      });

      // Clean up problematic state keys that can cause issues in worktrees
      await this.cleanupStateDatabase(targetStorage.storagePath);

      DR.logger.success(
        'Successfully copied VS Code workspace storage to worktree'
      );
      return true;
    } catch (error) {
      DR.logger.error(
        `Failed to copy workspace storage: ${ErrorUtils.getErrorString(error)}`
      );
      return false;
    }
  }

  /**
   * Checks if a workspace storage directory exists for the given workspace path.
   *
   * @param workspacePath The absolute path to the workspace folder
   * @returns true if workspace storage exists, false otherwise
   */
  public static async hasWorkspaceStorage(
    workspacePath: string
  ): Promise<boolean> {
    const storage = await this.findWorkspaceStorage(workspacePath);
    return storage !== undefined;
  }

  /**
   * Deletes the workspace storage for a given workspace path.
   *
   * WARNING: This permanently deletes all workspace-specific VS Code state.
   * Use with caution.
   *
   * @param workspacePath The absolute path to the workspace folder
   * @returns true if deleted, false if not found or error
   */
  public static async deleteWorkspaceByPath(
    workspacePath: string
  ): Promise<boolean> {
    try {
      const storage = await this.findWorkspaceStorage(workspacePath);
      if (!storage) {
        DR.logger.verbose.info('No workspace storage found to delete.');
        return false;
      }

      await fs.remove(storage.storagePath);

      DR.logger.verbose.info(
        `Deleted workspace storage: ${storage.storageHash}`
      );
      return true;
    } catch (error) {
      DR.logger.error(
        `Error deleting workspace storage: ${ErrorUtils.getErrorString(error)}`
      );
      return false;
    }
  }

  /**
   * Deletes a workspace storage directory by its storage hash.
   *
   * WARNING: This permanently deletes all workspace-specific VS Code state.
   * Use with caution.
   *
   * @param storageHash The storage directory hash name
   * @returns true if deleted, false if not found or error
   */
  public static async deleteWorkspaceByHash(
    storageHash: string
  ): Promise<boolean> {
    try {
      const storagePath = await this.buildStoragePath(storageHash);

      if (!(await fs.pathExists(storagePath))) {
        return false;
      }

      await fs.remove(storagePath);
      return true;
    } catch (error) {
      DR.logger.error(
        `Error deleting workspace storage: ${ErrorUtils.getErrorString(error)}`
      );
      return false;
    }
  }

  /**
   * Lists all VS Code workspace storage directories with their folder paths.
   *
   * @returns Array of objects containing storageHash and workspacePath for each workspace
   */
  public static async listWorkspaces(): Promise<
    Array<{ storageHash: string; workspacePath: string }>
  > {
    try {
      const baseDir = await this.getWorkspaceStorageBaseDir();
      const workspaces: Array<{ storageHash: string; workspacePath: string }> =
        [];

      if (!(await fs.pathExists(baseDir))) {
        return workspaces;
      }

      const entries = await this.getWorkspaceStorageDirectories(baseDir);

      for (const entry of entries) {
        const workspaceInfo = await this.buildWorkspaceInfoFromMetadata(
          baseDir,
          entry
        );

        if (workspaceInfo) {
          workspaces.push({
            storageHash: workspaceInfo.storageHash,
            workspacePath: workspaceInfo.workspacePath
          });
        }
      }

      return workspaces;
    } catch (error) {
      DR.logger.error(
        `Error listing workspaces: ${ErrorUtils.getErrorString(error)}`
      );
      return [];
    }
  }

  /**
   * Gets all valid workspace storage directory names from the base directory.
   *
   * @param baseDir The workspace storage base directory
   * @returns Array of directory names that contain workspace.json files
   */
  private static async getWorkspaceStorageDirectories(
    baseDir: string
  ): Promise<string[]> {
    const entries = await fs.readdir(baseDir);
    const directories: string[] = [];

    for (const entry of entries) {
      const entryPath = path.join(baseDir, entry);
      const entryStat = await fs.stat(entryPath);

      if (!entryStat.isDirectory()) {
        continue;
      }

      if (await fs.pathExists(this.workspaceMetadataPath(entryPath))) {
        directories.push(entry);
      }
    }

    return directories;
  }

  /**
   * Builds workspace storage metadata information from a storage directory.
   *
   * @param baseDir The workspace storage base directory
   * @param storageHash The storage directory hash name
   * @returns WorkspaceStorageInfo if metadata exists, undefined otherwise
   */
  private static async buildWorkspaceInfoFromMetadata(
    baseDir: string,
    storageHash: string
  ): Promise<WorkspaceStorageInfo | undefined> {
    try {
      const storagePath = path.join(baseDir, storageHash);
      const workspaceJsonPath = this.workspaceMetadataPath(storagePath);

      const workspaceData = (await fs.readJson(workspaceJsonPath)) as {
        folder?: string;
      };

      if (!workspaceData.folder) {
        return undefined;
      }

      const workspacePath = this.normalizeWorkspacePath(
        this.uriToPath(workspaceData.folder)
      );

      return {
        storageHash,
        storagePath,
        workspacePath
      };
    } catch (error) {
      DR.logger.verbose.error(
        `Error reading workspace metadata for ${storageHash}: ${ErrorUtils.getErrorString(error)}`
      );
      return undefined;
    }
  }

  /**
   * Attempts to locate workspace storage by computing the VS Code hash or falling back to metadata scanning.
   *
   * @param normalizedPath The normalized workspace path
   * @returns Workspace storage info if found, undefined otherwise
   */
  private static async lookupStorageByWorkspace(
    normalizedPath: string
  ): Promise<WorkspaceStorageInfo | undefined> {
    const computedHash =
      await this.computeWorkspaceHashIfPossible(normalizedPath);

    if (computedHash) {
      const storagePath = await this.buildStoragePath(computedHash);
      if (await fs.pathExists(storagePath)) {
        return {
          storageHash: computedHash,
          storagePath,
          workspacePath: normalizedPath
        };
      }
    }

    return this.lookupStorageByMetadata(normalizedPath);
  }

  /**
   * Scans workspace metadata to locate storage directories for a given path.
   *
   * @param normalizedPath The normalized workspace path
   * @returns Workspace storage info if found, undefined otherwise
   */
  private static async lookupStorageByMetadata(
    normalizedPath: string
  ): Promise<WorkspaceStorageInfo | undefined> {
    const baseDir = await this.getWorkspaceStorageBaseDir();

    if (!(await fs.pathExists(baseDir))) {
      return undefined;
    }

    const entries = await this.getWorkspaceStorageDirectories(baseDir);

    for (const entry of entries) {
      const info = await this.buildWorkspaceInfoFromMetadata(baseDir, entry);
      if (info && info.workspacePath === normalizedPath) {
        return info;
      }
    }

    return undefined;
  }

  /**
   * Computes the workspace storage hash when possible.
   *
   * @param normalizedPath The normalized workspace path
   * @returns The computed hash if successful, undefined otherwise
   */
  private static async computeWorkspaceHashIfPossible(
    normalizedPath: string
  ): Promise<string | undefined> {
    try {
      return await this.computeWorkspaceId(normalizedPath);
    } catch (error) {
      DR.logger.verbose.info(
        `Unable to compute workspace hash for ${normalizedPath}: ${ErrorUtils.getErrorString(error)}`
      );
      return undefined;
    }
  }

  /**
   * Normalizes a workspace path for consistent comparisons.
   *
   * @param workspacePath The workspace path to normalize
   * @returns Normalized workspace path
   */
  private static normalizeWorkspacePath(workspacePath: string): string {
    return path.normalize(workspacePath);
  }

  /**
   * Builds the absolute storage path for a workspace hash.
   *
   * @param storageHash The workspace storage hash
   * @returns Absolute storage directory path
   */
  private static async buildStoragePath(storageHash: string): Promise<string> {
    const baseDir = await this.getWorkspaceStorageBaseDir();
    return path.join(baseDir, storageHash);
  }

  /**
   * Builds the path to the workspace metadata file within a storage directory.
   *
   * @param storagePath The storage directory path
   * @returns Absolute path to workspace metadata file
   */
  private static workspaceMetadataPath(storagePath: string): string {
    return path.join(storagePath, this.WORKSPACE_METADATA_FILE);
  }

  /**
   * Writes workspace metadata matching VS Code's expectations.
   *
   * @param storagePath The storage directory path
   * @param normalizedPath The normalized workspace path
   */
  private static async writeWorkspaceMetadata(
    storagePath: string,
    normalizedPath: string
  ): Promise<void> {
    const workspaceJson = {
      folder: this.pathToUri(normalizedPath)
    };

    await fs.writeFile(
      this.workspaceMetadataPath(storagePath),
      JSON.stringify(workspaceJson, null, 2)
    );
  }

  /**
   * Copies storage contents from source to target, excluding specified items.
   *
   * @param data Copy configuration
   * @param data.sourcePath Absolute path to the source storage directory
   * @param data.targetPath Absolute path to the target storage directory
   * @param data.exclude Item names to exclude during copy
   */
  private static async copyStorageContents(data: {
    sourcePath: string;
    targetPath: string;
    exclude: string[];
  }): Promise<void> {
    const { sourcePath, targetPath, exclude } = data;
    const items = await fs.readdir(sourcePath);

    for (const item of items) {
      if (item === this.WORKSPACE_METADATA_FILE || exclude.includes(item)) {
        DR.logger.verbose.info(`Skipping: ${item}`);
        continue;
      }

      const sourceItemPath = path.join(sourcePath, item);
      const targetItemPath = path.join(targetPath, item);

      try {
        const stats = await fs.stat(sourceItemPath);
        DR.logger.verbose.info(
          `Copying ${stats.isDirectory() ? 'directory' : 'file'}: ${item}`
        );
        await fs.copy(sourceItemPath, targetItemPath, { overwrite: true });
      } catch (error) {
        DR.logger.verbose.error(
          `Error copying ${item}: ${ErrorUtils.getErrorString(error)}`
        );
      }
    }
  }

  /**
   * Converts a file:// URI to a file system path.
   *
   * @param uri The file URI to convert
   * @returns The file system path
   */
  private static uriToPath(uri: string): string {
    return uri.replace('file://', '');
  }

  /**
   * Converts a file system path to a file:// URI.
   *
   * @param filePath The file system path to convert
   * @returns The file URI
   */
  private static pathToUri(filePath: string): string {
    return `file://${filePath}`;
  }

  /**
   * Cleans up problematic keys from the state.vscdb database when copying workspace storage.
   *
   * This removes keys that can cause issues or confusion in a new worktree:
   * - Open tabs and editor layout (will start fresh)
   * - File history (will be regenerated)
   * - Search and find history (not needed in new worktree)
   *
   * See STATE_KEYS_TO_REMOVE for the complete list.
   *
   * @param targetStoragePath The absolute path to the target workspace storage directory
   */
  private static async cleanupStateDatabase(
    targetStoragePath: string
  ): Promise<void> {
    const dbPath = path.join(targetStoragePath, 'state.vscdb');

    if (!(await fs.pathExists(dbPath))) {
      return;
    }

    try {
      const db = new Database(dbPath);

      try {
        let removedCount = 0;

        // Remove keys defined in STATE_KEYS_TO_REMOVE
        for (const { key, reason } of this.STATE_KEYS_TO_REMOVE) {
          const result = db
            .prepare('DELETE FROM ItemTable WHERE key = ?')
            .run(key);
          if (result.changes > 0) {
            removedCount++;
            DR.logger.info(`Removed '${key}': ${reason}`);
          }
        }

        if (removedCount > 0) {
          DR.logger.info(
            `Cleaned up ${removedCount} state key(s) from workspace storage`
          );
        }

        // Force write to disk
        db.pragma('synchronous = FULL');
        db.pragma('wal_checkpoint(TRUNCATE)');
      } finally {
        db.close();
      }
    } catch (error) {
      DR.logger.warn(
        `Failed to clean up state database: ${ErrorUtils.getErrorString(error)}`
      );
    }
  }
}
