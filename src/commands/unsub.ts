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
  // Determine the working directory - use current directory as default
  const workingDirectory = process.cwd();

  if (!packagePrefix) {
    // Unsubscribe from all packages
    DR.logger.info('Unsubscribing from all packages...');

    try {
      const { output, didComplete } = await CLIService.execCmd(
        'local-npm unsubscribe',
        true,
        workingDirectory
      );

      if (didComplete) {
        DR.logger.success('Successfully unsubscribed from all packages');
      } else {
        DR.logger.error('Failed to unsubscribe from all packages');
      }

      if (output.trim()) {
        console.log(output);
      }
    } catch (error) {
      DR.logger.error(`Error unsubscribing from packages: ${String(error)}`);
    }
    return;
  }

  // Unsubscribe from a specific package
  const normalizedPrefix = packagePrefix.toLowerCase();

  // Get the package name from the localNpmPackages configuration
  const packageName = localNpmPackages[normalizedPrefix];
  if (!packageName) {
    DR.logger.error(
      `The package prefix "${packagePrefix}" does not match any available packages. See below for available options:`
    );
    logAvailablePackages();
    return;
  }

  // Find the project that matches the current directory
  const currentDir = path.basename(workingDirectory);
  const matchingProject = Object.values(projects).find(
    (project) => project.folderName === currentDir
  );

  let workingDirectories: string[] = [];

  if (
    matchingProject &&
    matchingProject.packageJsonPaths &&
    matchingProject.packageJsonPaths.length > 0
  ) {
    // Use all directories containing package.json files
    workingDirectories = matchingProject.packageJsonPaths.map(
      (packageJsonPath) =>
        path.resolve(workingDirectory, path.dirname(packageJsonPath))
    );
  } else {
    // Default to current directory
    workingDirectories = [workingDirectory];
  }

  DR.logger.info(`Unsubscribing from package "${packageName}"...`);
  DR.logger.info(`Running in ${workingDirectories.length} directory(ies)`);

  // Run unsubscription in all working directories
  await Promise.allSettled(
    workingDirectories.map(async (dir, index) => {
      DR.logger.info(
        `[${index + 1}/${workingDirectories.length}] Running in: ${dir}`
      );

      const { output, didComplete } = await CLIService.execCmd(
        `local-npm unsubscribe ${packageName}`,
        true,
        dir
      );

      return { workingDirectory: dir, output, didComplete };
    })
  );
}
