import execCmd from './cmd';
import { name as PACKAGE_NAME } from '../../package.json';
import Store from '../Store';
import datesAreOnSameDay from './dateFunctions';
import Log from './logger';

async function hasAlreadyBeenUpdatedToday(): Promise<boolean> {
  const lastCheckDate = await Store.getLastCheckedDate();
  Log.verbose.info(`lastCheckDate is: ${lastCheckDate}`);
  if (!lastCheckDate) {
    Log.verbose.info("Last check date wasn't there yet, adding that now...");
    await Store.set('lastUpdateCheckDate', new Date().toString());
    return false;
  }
  if (datesAreOnSameDay(lastCheckDate, new Date())) {
    await Store.set('lastUpdateCheckDate', new Date().toString());
    return true;
  }
  Log.verbose.info('Last check date was before today...');
  await Store.set('lastUpdateCheckDate', new Date().toString());
  return false;
}

function convertArgsToString(args: string[]): string {
  // Remove first two because those are not the actual args
  const argsThatMatter = args.splice(0, 2);
  // Join on a space
  return argsThatMatter.join(' ');
}

/**
 * Triggers an update of this package.
 */
export async function triggerUpdate(args: string[]): Promise<void> {
  console.log('Executing forced update...');
  await execCmd(`~/startup.sh update mainscripts ${convertArgsToString(args)}`);
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
export async function updateIfNeeded(args: string[]): Promise<void> {
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
      Log.failure('Update is needed. Installing update now...');
      triggerUpdate(args);
    }
    Log.verbose.success(`Package is up to date. Continuing...`);
  }
}
