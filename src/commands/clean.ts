import {
  CurrentEnv,
  execCmd,
  Log,
  OperatingSystemType
} from '@aneuhold/core-ts-lib';

/**
 * Different things that can be cleaned.
 */
enum CleanTarget {
  branches = 'branches'
}

/**
 * The main entry-point for the `clean` command.
 */
export default async function clean(cleanTarget?: string): Promise<void> {
  if (!cleanTarget) {
    Log.error(
      `No target was specified. See below for a list of valid targets:`
    );
    logValidCleanTargets();
    return;
  }
  // Check if the target is one of the valid CleanTarget values
  const target = cleanTarget.toLowerCase() as CleanTarget;

  switch (target) {
    case CleanTarget.branches:
      await cleanBranches();
      break;
    default:
      Log.error(
        `The target "${target}" is not a valid target. See below ` +
          `for a list of valid targets:`
      );
      logValidCleanTargets();
      break;
  }
}

/**
 * Removes all git branches besides the main branch locally.
 */
async function cleanBranches() {
  Log.success(`Removing all git branches besides the main branch locally...`);
  if (CurrentEnv.os === OperatingSystemType.Windows) {
    // Execute the powershell version of the command
    const returnValue = await execCmd(
      `git branch -D  @(git branch | select-string -NotMatch "main" | Foreach {$_.Line.Trim()})`
    );
    Log.info(returnValue.output);
    return;
  }
  // Execute the bash version of the command
  const returnValue = await execCmd(
    `git branch | grep -v "main" | xargs git branch -D`
  );
  Log.info(returnValue.output);
}

function logValidCleanTargets() {
  Object.keys(CleanTarget).forEach((printTarget) => {
    console.log(`- ${printTarget}\n`);
  });
}
