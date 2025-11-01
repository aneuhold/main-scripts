import { DR, ErrorUtils, FileSystemService } from '@aneuhold/core-ts-lib';
import { cosmiconfig } from 'cosmiconfig';
import { access, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

/**
 * Full configuration schema for user config files.
 *
 * If updating, make sure to also update the main readme documentation.
 */
export type MainScriptsConfig = {
  projects?: Record<string, MainScriptsConfigProject>;
  worktreeBaseDir?: string;
};

/**
 * User-configurable project properties (excludes functions like setup/refresh).
 *
 * If updating, make sure to also update the main readme documentation.
 */
export type MainScriptsConfigProject = {
  folderName: string;
  solutionFilePath?: string;
  packageJsonPaths?: string[];
  /**
   * Can be set to provide nodemon arguments for when using
   */
  nodemonArgs?: { [relativeFolderPath: string]: string[] };
  worktreeConfig?: {
    /**
     * Extra files to copy into new worktrees that would normally be ignored. This can be a glob
     * pattern or file names directly. For example `[".env", "environments/*"]`.
     *
     * These are copied after the worktree is created, but before any post-create commands are run.
     */
    extraFilesToCopy?: string[];
    /**
     * Commands to run after creating a new worktree and copying the extra files.
     */
    postCreateCommands?: string[];
    /**
     * Indicates if the `setup` command should be run automatically after creating a new worktree.
     *
     * If true, it runs after copying extra files, and running post-create commands.
     */
    autoSetup?: boolean;
  };
};

/**
 * Default configuration with all required fields.
 */
const DEFAULT_CONFIG: MainScriptsConfig = {
  projects: {},
  worktreeBaseDir: '../'
};

/**
 * Service for loading user configuration using cosmiconfig.
 * Searches for configuration in the user's home directory.
 */
export class ConfigService {
  private static cachedConfig: MainScriptsConfig | null = null;
  private static readonly MODULE_NAME = 'tb-main-scripts';

  /**
   * Load user configuration using cosmiconfig.
   * Configuration can be provided in ~/.config/tb-main-scripts.json
   */
  static async loadConfig(): Promise<MainScriptsConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    const explorer = cosmiconfig(this.MODULE_NAME, {
      searchPlaces: [
        // User home directory config (JSON only)
        this.getHomeDirectoryConfigPath(),
        // Project directory configs (for dev dependency usage)
        `.${this.MODULE_NAME}.json`,
        // package.json field
        'package.json'
      ]
    });

    try {
      const result = await explorer.search();
      const userConfig = result?.config as MainScriptsConfig | undefined;

      // Merge user config with defaults
      this.cachedConfig = {
        ...DEFAULT_CONFIG,
        ...userConfig
      };

      if (result?.filepath) {
        DR.logger.verbose.info(`Loaded config from: ${result.filepath}`);
      }
    } catch (error) {
      DR.logger.verbose.error(
        `Failed to load config: ${ErrorUtils.getErrorString(error)}`
      );

      // Purposefully spread to ensure it is a new object
      this.cachedConfig = { ...DEFAULT_CONFIG };
    }

    return this.cachedConfig;
  }

  /**
   * Clears the cached configuration.
   * Useful for testing to ensure fresh config loads.
   */
  static clearCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Gets the path to the default config file location in the home directory.
   */
  static getHomeDirectoryConfigPath(): string {
    return path.join(os.homedir(), '.config', `${this.MODULE_NAME}.json`);
  }

  /**
   * Checks if a config file exists at the default location.
   */
  static async configExistsAtHomeDirectory(): Promise<boolean> {
    try {
      await access(this.getHomeDirectoryConfigPath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initializes a new config file with default values at the default location.
   *
   * @returns The path to the created config file, or null if it already exists
   */
  static async initConfigFile(): Promise<string | null> {
    const configPath = this.getHomeDirectoryConfigPath();
    const configExists = await this.configExistsAtHomeDirectory();

    if (configExists) {
      return null;
    }

    const configDir = path.dirname(configPath);
    await FileSystemService.checkOrCreateFolder(configDir);

    const defaultConfig = { ...DEFAULT_CONFIG };
    const configContent = JSON.stringify(defaultConfig, null, 2);

    await writeFile(configPath, configContent, 'utf-8');
    return configPath;
  }
}
