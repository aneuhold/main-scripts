import { DR } from '@aneuhold/core-ts-lib';
import { ConfigService } from '../services/ConfigService.js';

/**
 * Shows the current configuration or initializes a new config file.
 *
 * @param action The action to perform: 'show' (default) or 'init'
 */
export default async function config(action?: string): Promise<void> {
  if (action === 'init') {
    await initConfig();
  } else {
    await showConfig();
  }
  process.exit();
}

/**
 * Shows the current loaded configuration.
 */
async function showConfig(): Promise<void> {
  const currentConfig = await ConfigService.loadConfig();
  const configPath = ConfigService.getHomeDirectoryConfigPath();
  const configExists = await ConfigService.configExistsAtHomeDirectory();

  DR.logger.info(
    `Current main-scripts configuration:\n${JSON.stringify(currentConfig, null, 2)}`
  );
  DR.logger.info('');
  DR.logger.info(`Config file location: ${configPath}`);
  DR.logger.info(
    `Config file exists: ${configExists ? 'Yes' : 'No (using defaults)'}`
  );
}

/**
 * Initializes a new config file with default values.
 */
async function initConfig(): Promise<void> {
  const configPath = await ConfigService.initConfigFile();

  if (configPath === null) {
    DR.logger.info(
      `Config file already exists at: ${ConfigService.getHomeDirectoryConfigPath()}`
    );
    DR.logger.info('No changes made.');
    return;
  }

  DR.logger.info(`Created config file at: ${configPath}`);
  DR.logger.info('You can now edit this file to customize your configuration.');
}
