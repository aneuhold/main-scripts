import execCmd from './cmd';
import { name as PACKAGE_NAME } from '../../package.json';
import Store from '../Store';
import datesAreOnSameDay from './dateFunctions';
import Log from './logger';
import CurrentEnv, { OperatingSystemType } from './CurrentEnv';

/**
 * Checks if this package has already been updated today and stores the last
 * updated date locally regardless of the result.
 *
 * This does not trigger an update if it hasn't been updated.
 *
 * @returns {boolean} true if it has already been updated today and false if
 * not
 */
async function hasAlreadyBeenUpdatedToday(): Promise<boolean> {
  const lastCheckDate = await Store.get('lastUpdateCheckDate');
  Log.verbose.info(`lastCheckDate is: ${lastCheckDate}`);
  if (!lastCheckDate) {
    Log.verbose.info("Last check date wasn't there yet, adding that now...");
    await Store.set('lastUpdateCheckDate', new Date().toString());
    return false;
  }
  if (datesAreOnSameDay(new Date(lastCheckDate), new Date())) {
    await Store.set('lastUpdateCheckDate', new Date().toString());
    return true;
  }
  Log.verbose.info('Last check date was before today...');
  await Store.set('lastUpdateCheckDate', new Date().toString());
  return false;
}

/**
 * Triggers an update of this package.
 */
export async function triggerUpdate(): Promise<void> {
  let cmd = '';
  if (CurrentEnv.os() === OperatingSystemType.Windows) {
    // & says to powershell that you actually want to run the script in the
    // quotes afterwards
    // Also just running the startup script for now because of some infinite
    // loop issues with specifying arguments
    cmd = `& "$Home\\startup.ps1"`;
  } else {
    cmd = `~/startup.sh update mainscripts`;
  }
  Log.info(`Executing the following command: "${cmd}"`);
  const { output } = await execCmd(cmd);
  Log.info(output);

  // Kill this process once the command is executed to update
  process.exit(0);
}

/**
 * Checks if an update is needed for this package. If there is, then it updates
 * and passes in the arguments so that it can be called again once the update
 * is finished.
 *
 * Because the check for an update process is a bit long-winded, it only does
 * this once a day.
 *
 * @param {string[]} args the arguments provided by the user
 */
export async function updateIfNeeded(): Promise<void> {
  // Check if the check has already happened today
  if (await hasAlreadyBeenUpdatedToday()) {
    Log.verbose.info(
      'Package update has already been checked today. Continuing...'
    );
    return;
  }
  const { didComplete, output } = await execCmd(
    `npm outdated -g ${PACKAGE_NAME}`
  );
  if (didComplete) {
    const updateIsNeeded = output.length !== 0;
    if (updateIsNeeded) {
      Log.verbose.info(`Output of outdated command is: ${output}`);
      Log.failure('Update is needed. Installing update now...');
      triggerUpdate();
    } else {
      Log.verbose.success(`Package is up to date. Continuing...`);
    }
  }
}
