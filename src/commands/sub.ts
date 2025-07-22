import { DR } from '@aneuhold/core-ts-lib';
import path from 'path';
import localNpmPackages from '../config/localNpmPackages.js';
import projects from '../config/projects.js';
import CLIService from '../services/CLIService.js';

/**
 * Subscribes to a package using local-npm-registry.
 *
 * @param packagePrefix The prefix of the package to subscribe to (e.g., 'client-core' for '@company/client-core')
 */
export default async function sub(packagePrefix?: string): Promise<void> {
  if (!packagePrefix) {
    DR.logger.error(
      'No package prefix was specified. See below for available options:'
    );
    logAvailablePackages();
    return;
  }

  // Normalize the package prefix
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

  // Determine the working directory - use current directory as default
  let workingDirectory = process.cwd();

  // Try to find a project that might have specific package.json paths configured
  const matchingProject = Object.values(projects).find(
    (project) => project.folderName === path.basename(workingDirectory)
  );

  if (
    matchingProject &&
    matchingProject.packageJsonPaths &&
    matchingProject.packageJsonPaths.length > 0
  ) {
    // Use the directory containing the first package.json
    const packageJsonPath = matchingProject.packageJsonPaths[0];
    workingDirectory = path.resolve(
      workingDirectory,
      path.dirname(packageJsonPath)
    );
  }

  DR.logger.info(`Subscribing to package "${packageName}"...`);

  try {
    const { output, didComplete } = await CLIService.execCmd(
      `local-npm subscribe ${packageName}`,
      true,
      workingDirectory
    );

    if (didComplete) {
      DR.logger.success(`Successfully subscribed to ${packageName}`);
    } else {
      DR.logger.error(`Failed to subscribe to ${packageName}`);
    }

    if (output.trim()) {
      console.log(output);
    }
  } catch (error) {
    DR.logger.error(`Error subscribing to package: ${String(error)}`);
  }
}

/**
 * Logs the available packages that can be subscribed to.
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
