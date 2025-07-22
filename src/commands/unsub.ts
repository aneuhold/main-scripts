import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import localNpmPackages, {
  logAvailablePackages
} from '../config/localNpmPackages.js';
import projects from '../config/projects.js';
import CLIService from '../services/CLIService.js';

/**
 * Unsubscribes from a package using local-npm-registry.
 *
 * @param packagePrefix The prefix of the package to unsubscribe from (e.g., 'client-core' for '@company/client-core'). If not provided, unsubscribes from all packages.
 */
export default async function unsub(packagePrefix?: string): Promise<void> {
  const workingDirectory = process.cwd();

  if (!packagePrefix) {
    DR.logger.info('Unsubscribing from all packages...');
    const workingDirectories = getWorkingDirectories(workingDirectory);
    await runUnsubscribeCommand(workingDirectories, 'local-npm unsubscribe');
    return;
  }

  // Unsubscribe from a specific package
  const normalizedPrefix = packagePrefix.toLowerCase();
  const packageName = localNpmPackages[normalizedPrefix];

  if (!packageName) {
    DR.logger.error(
      `The package prefix "${packagePrefix}" does not match any available packages. See below for available options:`
    );
    logAvailablePackages();
    return;
  }

  DR.logger.info(`Unsubscribing from package "${packageName}"...`);
  const workingDirectories = getWorkingDirectories(workingDirectory);
  await runUnsubscribeCommand(
    workingDirectories,
    `local-npm unsubscribe ${packageName}`
  );
}

/**
 * Gets the working directories based on the current directory and project configuration.
 *
 * @param workingDirectory The current working directory
 */
function getWorkingDirectories(workingDirectory: string): string[] {
  const currentDir = path.basename(workingDirectory);
  const matchingProject = Object.values(projects).find(
    (project) => project.folderName === currentDir
  );

  if (
    matchingProject &&
    matchingProject.packageJsonPaths &&
    matchingProject.packageJsonPaths.length > 0
  ) {
    return matchingProject.packageJsonPaths.map((packageJsonPath) =>
      path.resolve(workingDirectory, path.dirname(packageJsonPath))
    );
  }

  return [workingDirectory];
}

/**
 * Runs the unsubscribe command in all working directories and processes the results.
 *
 * @param workingDirectories Array of directories to run the command in
 * @param command The command to execute
 * @param packageName Optional package name for success/failure messages
 */
async function runUnsubscribeCommand(
  workingDirectories: string[],
  command: string
): Promise<void> {
  DR.logger.info(`Running in ${workingDirectories.length} directory(ies)`);

  await Promise.allSettled(
    workingDirectories.map(async (dir, index) => {
      DR.logger.info(
        `[${index + 1}/${workingDirectories.length}] Running in: ${dir}`
      );

      const { output, didComplete } = await CLIService.execCmd(
        command,
        true,
        dir
      );

      return { workingDirectory: dir, output, didComplete };
    })
  );
}
