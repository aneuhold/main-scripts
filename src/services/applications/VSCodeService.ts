import { DR, ErrorUtils } from '@aneuhold/core-ts-lib';
import { randomBytes } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import CurrentEnv, { OperatingSystemType } from '../../utils/CurrentEnv.js';
import CLIService from '../CLIService.js';

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
 * Service for interacting with VS Code workspace storage.
 *
 * VS Code stores workspace-specific data (including extension enabled/disabled state,
 * UI state, and other workspace preferences) in a platform-specific location:
 * - macOS: ~/Library/Application Support/Code/User/workspaceStorage/
 * - Windows: %APPDATA%\Code\User\workspaceStorage\
 * - Linux: ~/.config/Code/User/workspaceStorage/
 *
 * To navigate to this on Mac use:
 *
 * ```
 * cd "~/Library/Application Support/Code"
 * code .
 * ```
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
  /**
   * Gets the base directory where VS Code stores workspace storage.
   * This is platform-specific:
   * - macOS: ~/Library/Application Support/Code/User/workspaceStorage/
   * - Windows: %APPDATA%\Code\User\workspaceStorage\
   * - Linux: ~/.config/Code/User/workspaceStorage/
   *
   * @returns The absolute path to the workspace storage base directory
   */
  public static getWorkspaceStorageBaseDir(): string {
    const currentOs = CurrentEnv.os;
    const homeDir = CurrentEnv.homeDir();

    switch (currentOs) {
      case OperatingSystemType.MacOSX:
        return path.join(
          homeDir,
          'Library',
          'Application Support',
          'Code',
          'User',
          'workspaceStorage'
        );
      case OperatingSystemType.Windows:
        return path.join(
          process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
          'Code',
          'User',
          'workspaceStorage'
        );
      case OperatingSystemType.Linux:
        return path.join(
          homeDir,
          '.config',
          'Code',
          'User',
          'workspaceStorage'
        );
      default:
        throw new Error(`Unsupported operating system: ${currentOs}`);
    }
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
      const baseDir = this.getWorkspaceStorageBaseDir();
      const normalizedPath = path.normalize(workspacePath);

      DR.logger.verbose.info(
        `Searching for workspace storage for: ${normalizedPath}`
      );

      // Check if base directory exists
      if (!(await fs.pathExists(baseDir))) {
        DR.logger.verbose.info(
          `Workspace storage base directory does not exist: ${baseDir}`
        );
        return undefined;
      }

      const searchUri = this.pathToUri(normalizedPath);
      const entries = await this.getWorkspaceStorageDirectories(baseDir);

      for (const entry of entries) {
        const workspaceJsonPath = path.join(baseDir, entry, 'workspace.json');

        try {
          const workspaceData = (await fs.readJson(workspaceJsonPath)) as {
            folder?: string;
          };

          if (workspaceData.folder === searchUri) {
            DR.logger.verbose.info(
              `Found workspace storage: ${entry} for ${normalizedPath}`
            );

            return {
              storageHash: entry,
              storagePath: path.join(baseDir, entry),
              workspacePath: normalizedPath
            };
          }
        } catch (jsonError) {
          DR.logger.verbose.error(
            `Error reading workspace.json in ${entry}: ${ErrorUtils.getErrorString(jsonError)}`
          );
          continue;
        }
      }

      DR.logger.verbose.info(
        `No workspace storage found for: ${normalizedPath}`
      );
      return undefined;
    } catch (error) {
      DR.logger.error(
        `Error finding workspace storage: ${ErrorUtils.getErrorString(error)}`
      );
      return undefined;
    }
  }

  /**
   * Creates a new workspace storage directory for a given workspace path.
   *
   * This creates the directory structure and workspace.json file that VS Code
   * expects. The actual state.vscdb and other files will be created by VS Code
   * when the workspace is first opened, or can be copied from another workspace.
   *
   * Note: This uses a simple random hash for the directory name. VS Code will
   * recreate its own hash-based directory when it opens the workspace, but this
   * temporary storage allows us to copy data before that happens.
   *
   * @param workspacePath The absolute path to the workspace folder
   * @returns WorkspaceStorageInfo for the newly created storage directory
   */
  public static async createWorkspaceStorage(
    workspacePath: string
  ): Promise<WorkspaceStorageInfo> {
    try {
      const baseDir = this.getWorkspaceStorageBaseDir();
      const normalizedPath = path.normalize(workspacePath);

      // Generate a unique hash for the new workspace storage directory
      // We use a timestamp + random value to ensure uniqueness
      const storageHash = randomBytes(16).toString('hex');
      const storagePath = path.join(baseDir, storageHash);

      // Create the storage directory
      await fs.ensureDir(storagePath);

      // Create workspace.json
      const workspaceJson = {
        folder: this.pathToUri(normalizedPath)
      };
      const workspaceJsonPath = path.join(storagePath, 'workspace.json');

      await fs.writeFile(
        workspaceJsonPath,
        JSON.stringify(workspaceJson, null, 2)
      );

      DR.logger.verbose.info(
        `Created workspace storage: ${storageHash} for ${normalizedPath}`
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
   * Copies workspace storage from one workspace to another.
   *
   * This copies all VS Code workspace-specific state including:
   * - state.vscdb: Extension enabled/disabled state, UI state, etc.
   * - Extension-specific subdirectories: Per-extension workspace storage
   * - Other workspace-specific files
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

      // Create target workspace storage directory if it doesn't exist
      if (!targetStorage) {
        targetStorage = await this.createWorkspaceStorage(targetWorkspacePath);
      }

      DR.logger.verbose.info(`Target storage at: ${targetStorage.storagePath}`);

      // Copy all files from source to target, excluding specified items
      const items = await fs.readdir(sourceStorage.storagePath);

      for (const item of items) {
        // Skip workspace.json (already created) and excluded items
        if (item === 'workspace.json' || exclude.includes(item)) {
          DR.logger.verbose.info(`Skipping: ${item}`);
          continue;
        }

        const sourcePath = path.join(sourceStorage.storagePath, item);
        const targetPath = path.join(targetStorage.storagePath, item);

        try {
          const stats = await fs.stat(sourcePath);

          if (stats.isDirectory()) {
            DR.logger.verbose.info(`Copying directory: ${item}`);
            await fs.copy(sourcePath, targetPath, { overwrite: true });
          } else {
            DR.logger.verbose.info(`Copying file: ${item}`);
            await fs.copy(sourcePath, targetPath, { overwrite: true });
          }
        } catch (itemError) {
          DR.logger.verbose.error(
            `Error copying ${item}: ${ErrorUtils.getErrorString(itemError)}`
          );
          // Continue with other items even if one fails
        }
      }

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
   * Gets the list of disabled extensions for a workspace by querying its state database.
   *
   * This reads from the state.vscdb SQLite database to determine which extensions
   * are disabled for the workspace. Note that VS Code must have created the database
   * first (by opening the workspace at least once).
   *
   * @param workspacePath The absolute path to the workspace folder
   * @returns Array of extension IDs that are disabled, or empty array if none/error
   */
  public static async getDisabledExtensions(
    workspacePath: string
  ): Promise<string[]> {
    try {
      const storage = await this.findWorkspaceStorage(workspacePath);
      if (!storage) {
        DR.logger.verbose.info(
          'No workspace storage found. No disabled extensions.'
        );
        return [];
      }

      const stateDbPath = path.join(storage.storagePath, 'state.vscdb');
      if (!(await fs.pathExists(stateDbPath))) {
        DR.logger.verbose.info('No state.vscdb found. No disabled extensions.');
        return [];
      }

      const query =
        "SELECT value FROM ItemTable WHERE key = 'extensionsIdentifiers/disabled'";
      const { output, didComplete } = await CLIService.execCmd(
        `sqlite3 "${stateDbPath}" "${query}"`
      );

      if (!didComplete || !output.trim()) {
        return [];
      }

      // Parse the JSON array of disabled extensions
      type DisabledExtension = { id: string; uuid?: string };
      const disabled = JSON.parse(output.trim()) as DisabledExtension[];
      return disabled.map((ext) => ext.id);
    } catch (error) {
      DR.logger.verbose.error(
        `Error reading disabled extensions: ${ErrorUtils.getErrorString(error)}`
      );
      return [];
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
      const baseDir = this.getWorkspaceStorageBaseDir();
      const storagePath = path.join(baseDir, storageHash);

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
      const baseDir = this.getWorkspaceStorageBaseDir();
      const workspaces: Array<{ storageHash: string; workspacePath: string }> =
        [];

      if (!(await fs.pathExists(baseDir))) {
        return workspaces;
      }

      const entries = await this.getWorkspaceStorageDirectories(baseDir);

      for (const entry of entries) {
        const workspacePath = await this.readWorkspacePath(baseDir, entry);

        if (workspacePath) {
          workspaces.push({
            storageHash: entry,
            workspacePath
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

      const workspaceJsonPath = path.join(entryPath, 'workspace.json');
      if (await fs.pathExists(workspaceJsonPath)) {
        directories.push(entry);
      }
    }

    return directories;
  }

  /**
   * Reads the workspace path from a workspace.json file.
   *
   * @param baseDir The workspace storage base directory
   * @param storageHash The storage directory hash name
   * @returns The workspace path if found, undefined otherwise
   */
  private static async readWorkspacePath(
    baseDir: string,
    storageHash: string
  ): Promise<string | undefined> {
    try {
      const workspaceJsonPath = path.join(
        baseDir,
        storageHash,
        'workspace.json'
      );
      const workspaceData = (await fs.readJson(workspaceJsonPath)) as {
        folder?: string;
      };

      if (workspaceData.folder) {
        return this.uriToPath(workspaceData.folder);
      }

      return undefined;
    } catch {
      return undefined;
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
}
