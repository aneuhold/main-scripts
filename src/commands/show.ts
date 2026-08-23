import { DR } from '@aneuhold/core-ts-lib';
import CLIService from '../services/CLI.service.js';
import ShellService from '../services/applications/Shell.service.js';
import CurrentEnv from '../utils/CurrentEnv.js';

/**
 * Different things that can be shown.
 */
enum ShowTarget {
  ShellMemUsage = 'shell-mem-usage'
}

/**
 * Returns true if the given string is a valid {@link ShowTarget}.
 *
 * @param value the string to check
 */
function isShowTarget(value: string): value is ShowTarget {
  const values: string[] = Object.values(ShowTarget);
  return values.includes(value);
}

/**
 * The main entry-point for the `show` command.
 *
 * @param target the target to show
 */
export default async function show(target?: string): Promise<void> {
  const selected =
    target ??
    (await CLIService.selectFromList(
      Object.values(ShowTarget),
      'Select what to show',
      true
    ));

  if (!isShowTarget(selected)) {
    const availableTargets = Object.values(ShowTarget).join(', ');
    DR.logger.error(
      `Unknown target "${selected}". Available targets: ${availableTargets}`
    );
    return;
  }

  switch (selected) {
    // Disabled for now so it is easy to expand in the future.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    case ShowTarget.ShellMemUsage:
      await showShellMemUsage();
      break;
  }
}

/**
 * Prints how much memory the interactive shell sessions hold, grouped by the
 * directory each session sits in.
 */
async function showShellMemUsage(): Promise<void> {
  const sessions = await ShellService.getInteractiveShellsProcessInfo();

  if (sessions.length === 0) {
    DR.logger.info('No interactive shell sessions were found.');
    return;
  }

  const totalBytes = sessions.reduce(
    (total, { memoryBytes }) => total + memoryBytes,
    0
  );

  console.log('\n');
  console.table(
    groupShellProcessesByDirectory(sessions).map(
      ({ directory, memoryBytes, shellCount }) => ({
        Directory: directory,
        Memory: formatBytes(memoryBytes),
        Shells: shellCount
      })
    )
  );
  DR.logger.info(
    `${sessions.length} shell sessions holding ${formatBytes(totalBytes)}.`
  );
}

/**
 * Formats a number of bytes into a human readable string.
 *
 * @param bytes the number of bytes to format
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Replaces the home directory portion of the given path with `~`.
 *
 * @param directory the directory to shorten
 */
function shortenPath(directory: string): string {
  const homeDir = CurrentEnv.homeDir();
  return directory.startsWith(homeDir)
    ? `~${directory.slice(homeDir.length)}`
    : directory;
}

/**
 * Groups the given sessions by the directory they sit in, heaviest first.
 *
 * @param shellProcesses the sessions to group
 */
function groupShellProcessesByDirectory(
  shellProcesses: { cwd: string; memoryBytes: number }[]
) {
  const usageByDirectory = new Map<
    string,
    {
      directory: string;
      memoryBytes: number;
      shellCount: number;
    }
  >();

  for (const { cwd, memoryBytes } of shellProcesses) {
    const directory = cwd ? shortenPath(cwd) : '(unknown)';
    const existingUsage = usageByDirectory.get(directory);
    if (existingUsage) {
      existingUsage.memoryBytes += memoryBytes;
      existingUsage.shellCount += 1;
    } else {
      usageByDirectory.set(directory, {
        directory,
        memoryBytes,
        shellCount: 1
      });
    }
  }

  return [...usageByDirectory.values()].sort(
    (a, b) => b.memoryBytes - a.memoryBytes
  );
}
