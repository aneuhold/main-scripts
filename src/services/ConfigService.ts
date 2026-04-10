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
  vsCodeAlternativeCommand?: string;
  img?: MainScriptsConfigImg;
};

/**
 * Configuration for the `tb img` command that uploads images to Cloudflare R2.
 *
 * If updating, make sure to also update the main readme documentation.
 */
export type MainScriptsConfigImg = {
  /** Folder that `tb img` scans for files to upload. Supports `~`. */
  pickerDir: string;
  r2: {
    accountId: string;
    bucketName: string;
    accessKeyId: string;
    secretAccessKey: string;
    /** Public URL base, e.g. https://pub-xxxx.r2.dev (no trailing slash). */
    publicUrlBase: string;
  };
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
  vsCodeAlternativeCommand?: string;
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
  worktreeBaseDir: '../',
  vsCodeAlternativeCommand: 'code'
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
        `.config/${this.MODULE_NAME}.json`,
        // Project directory configs (for dev dependency usage)
        `.${this.MODULE_NAME}.json`,
        // package.json field
        'package.json'
      ],
      // The search strategy is what allows it to look in multiple locations starting at the
      // current directory then moving up until the home directory.
      searchStrategy: 'global'
    });

    try {
      const result = await explorer.search();

      DR.logger.verbose.info(
        `Cosmiconfig search result: ${JSON.stringify(result)}`
      );

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

  /**
   * Adds or updates a project configuration in the config file.
   * Creates the config file if it doesn't exist.
   *
   * There's a bug in here where it doesn't start with the home directory config. It could
   * potentially start with the project local config if it exists, which is not desired. Can
   * fix later.
   *
   * @param folderName The name of the project folder
   */
  static async addProjectConfig(folderName: string): Promise<string> {
    // Ensure config file exists
    await this.initConfigFile();
    const config = await this.loadConfig();

    // Add or update the project
    if (!config.projects) {
      config.projects = {};
    }
    const projectConfig = this.createProjectTemplate(folderName);
    config.projects[folderName] = projectConfig;

    // Write back to file
    const configPath = this.getHomeDirectoryConfigPath();
    const configContent = JSON.stringify(config, null, 2);
    await writeFile(configPath, configContent, 'utf-8');

    return configPath;
  }

  /**
   * Creates a template project configuration with all possible options.
   *
   * @param folderName The name of the project folder
   * @returns A complete project configuration template
   */
  private static createProjectTemplate(
    folderName: string
  ): MainScriptsConfigProject {
    return {
      folderName,
      solutionFilePath: '',
      packageJsonPaths: [],
      nodemonArgs: {},
      worktreeConfig: {
        extraFilesToCopy: [],
        postCreateCommands: [],
        autoSetup: false
      }
    };
  }
}
