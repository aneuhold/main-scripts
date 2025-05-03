import { DateService, DR } from '@aneuhold/core-ts-lib';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import CLIService from '../services/CLIService.js';
import Store from '../utils/Store.js';
import CurrentEnv from './CurrentEnv.js';

/**
 * Checks if this package has already been updated today and stores the last
 * updated date locally regardless of the result.
 *
 * This does not trigger an update if it hasn't been updated.
 *
 * @returns true if it has already been updated today and false if
 * not
 */
async function hasAlreadyBeenUpdatedToday(): Promise<boolean> {
  const lastCheckDate = await Store.get('lastUpdateCheckDate');
  DR.logger.verbose.info(`lastCheckDate is: ${lastCheckDate}`);
  if (!lastCheckDate) {
    DR.logger.verbose.info(
      "Last check date wasn't there yet, adding that now..."
    );
    await Store.set('lastUpdateCheckDate', new Date().toString());
    return false;
  }
  if (DateService.datesAreOnSameDay(new Date(lastCheckDate), new Date())) {
    await Store.set('lastUpdateCheckDate', new Date().toString());
    return true;
  }
  DR.logger.verbose.info('Last check date was before today...');
  await Store.set('lastUpdateCheckDate', new Date().toString());
  return false;
}

/**
 * Triggers an update of this package.
 */
export async function triggerUpdate(): Promise<void> {
  await CurrentEnv.runStartupScript();
}

/**
 * Checks if an update is needed for this package. If there is, then it updates
 * and passes in the arguments so that it can be called again once the update
 * is finished.
 *
 * Because the check for an update process is a bit long-winded, it only does
 * this once a day.
 */
export async function updateIfNeeded(): Promise<void> {
  // Check if the check has already happened today
  if (await hasAlreadyBeenUpdatedToday()) {
    DR.logger.verbose.info(
      'Package update has already been checked today. Continuing...'
    );
    return;
  }
  const packageJson = await readPackageJson();
  const { didComplete, output } = await CLIService.execCmd(
    `npm outdated -g ${packageJson.name}`
  );
  if (didComplete) {
    const updateIsNeeded = output.length !== 0;
    if (updateIsNeeded) {
      DR.logger.verbose.info(`Output of outdated command is: ${output}`);
      DR.logger.failure('Update is needed. Installing update now...');
      await triggerUpdate();
    } else {
      DR.logger.verbose.success(`Package is up to date. Continuing...`);
    }
  }
}

/**
 *
 */
async function readPackageJson(): Promise<{ name: string }> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const packageJsonPath = join(__dirname, '../package.json');
  return JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
    name: string;
  };
}
