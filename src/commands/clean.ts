import {
  CLIService,
  CurrentEnv,
  Logger,
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
    Logger.error(
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
      Logger.error(
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
  Logger.success(
    `Removing all git branches besides the main branch locally...`
  );
  if (CurrentEnv.os === OperatingSystemType.Windows) {
    // Execute the powershell version of the command
    const returnValue = await CLIService.execCmd(
      `git branch -D  @(git branch | select-string -NotMatch "main" | Foreach {$_.Line.Trim()})`
    );
    Logger.info(returnValue.output);
    return;
  }
  // Execute the bash version of the command
  const returnValue = await CLIService.execCmd(
    `git branch | grep -v "main" | xargs git branch -D`
  );
  Logger.info(returnValue.output);
}

function logValidCleanTargets() {
  Object.keys(CleanTarget).forEach((printTarget) => {
    console.log(`- ${printTarget}\n`);
  });
}
