import { DR } from '@aneuhold/core-ts-lib';
import CLIService from '../services/CLIService.js';
import { ConfigService } from '../services/ConfigService.js';

/**
 * Shows the current configuration or initializes a new config file.
 *
 * @param action The action to perform: 'show' (default), 'init', or 'edit'
 */
export default async function config(action?: string): Promise<void> {
  if (action === 'init') {
    await initConfig();
  } else if (action === 'edit') {
    await editConfig();
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

/**
 * Opens the config file in VS Code.
 */
async function editConfig(): Promise<void> {
  const configPath = ConfigService.getHomeDirectoryConfigPath();
  const configExists = await ConfigService.configExistsAtHomeDirectory();

  if (!configExists) {
    DR.logger.error(`Config file does not exist at: ${configPath}`);
    DR.logger.info('Run "tb config init" to create one.');
    return;
  }

  DR.logger.success(`Opening config file in VS Code...`);
  await CLIService.execCmdWithTimeout(`code "${configPath}"`, 4000);
}
