import { DR } from '@aneuhold/core-ts-lib';
import { cosmiconfig } from 'cosmiconfig';

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
        `~/.config/${this.MODULE_NAME}.json`,
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
      DR.logger.verbose.error(`Failed to load config: ${String(error)}`);

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
}
