import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import localNpmPackages from '../config/localNpmPackages.js';
import projects from '../config/projects.js';
import CLIService from '../services/CLIService.js';

/**
 * Unsubscribes from a package using local-npm-registry.
 *
 * @param packagePrefix The prefix of the package to unsubscribe from (e.g., 'client-core' for '@company/client-core'). If not provided, unsubscribes from all packages.
 */
export default async function unsub(packagePrefix?: string): Promise<void> {
  // Determine the working directory - use current directory as default
  let workingDirectory = process.cwd();

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

  // Try to find a project that might have specific package.json paths configured
  const matchingProject = Object.values(projects).find(
    (project) => project.folderName === path.basename(workingDirectory)
  );

  if (
    matchingProject &&
    matchingProject.packageJsonPaths &&
    matchingProject.packageJsonPaths.length > 0
  ) {
    const packageJsonPath = matchingProject.packageJsonPaths[0];
    workingDirectory = path.resolve(
      workingDirectory,
      path.dirname(packageJsonPath)
    );
  }

  DR.logger.info(`Unsubscribing from package "${packageName}"...`);

  try {
    const { output, didComplete } = await CLIService.execCmd(
      `local-npm unsubscribe ${packageName}`,
      true,
      workingDirectory
    );

    if (didComplete) {
      DR.logger.success(`Successfully unsubscribed from ${packageName}`);
    } else {
      DR.logger.error(`Failed to unsubscribe from ${packageName}`);
    }

    if (output.trim()) {
      console.log(output);
    }
  } catch (error) {
    DR.logger.error(`Error unsubscribing from package: ${String(error)}`);
  }
}

/**
 * Logs the available packages that can be unsubscribed from.
 */
function logAvailablePackages() {
  const availablePackages = Object.entries(localNpmPackages).map(
    ([prefix, packageName]) => `- ${prefix} (${packageName})`
  );

  if (availablePackages.length === 0) {
    console.log('No projects are configured for package subscription.');
    return;
  }

  console.log('Available packages:');
  availablePackages.forEach((packageInfo) => {
    console.log(packageInfo);
  });
}
