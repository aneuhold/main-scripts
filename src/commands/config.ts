import { DR } from '@aneuhold/core-ts-lib';
import CLIService from '../services/CLIService.js';
import { ConfigService } from '../services/ConfigService.js';

/**
 * Shows the current configuration, initializes a new config file, or manages project configs.
 *
 * @param action The action to perform: 'show' (default), 'init', or 'edit'
 * @param folderName Optional folder name for 'init' action to create a project config
 */
export default async function config(
  action?: string,
  folderName?: string
): Promise<void> {
  if (action === 'init') {
    if (folderName) {
      await initProjectConfig(folderName);
    } else {
      await initConfig();
    }
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
 * Initializes a new project configuration with all available options.
 *
 * @param folderName The name of the project folder
 */
async function initProjectConfig(folderName: string): Promise<void> {
  DR.logger.info(`Creating project configuration for folder: ${folderName}...`);

  const configPath = await ConfigService.addProjectConfig(folderName);

  DR.logger.success(
    `Project configuration created for '${folderName}' in: ${configPath}`
  );
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
