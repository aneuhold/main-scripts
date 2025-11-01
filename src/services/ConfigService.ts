import { DR } from '@aneuhold/core-ts-lib';
import { cosmiconfig } from 'cosmiconfig';

/**
 * User-configurable project properties (excludes functions like setup/refresh).
 *
 * If updating, make sure to also update the main readme documentation.
 */
export type MainScriptsConfigProject = {
  folderName: string;
  solutionFilePath?: string;
  packageJsonPaths?: string[];
  nodemonArgs?: { [relativeFolderPath: string]: string[] };
};

/**
 * Full configuration schema for user config files.
 *
 * If updating, make sure to also update the main readme documentation.
 */
export type MainScriptsConfig = {
  projects?: Record<string, MainScriptsConfigProject>;
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
      const config = result?.config as MainScriptsConfig | undefined;
      this.cachedConfig = config ?? {};

      if (result?.filepath) {
        DR.logger.verbose.info(`Loaded config from: ${result.filepath}`);
      }
    } catch (error) {
      DR.logger.verbose.error(`Failed to load config: ${String(error)}`);
      this.cachedConfig = {};
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
